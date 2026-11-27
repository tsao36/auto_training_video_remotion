import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_SOURCE_BYTES = 1_000_000;
const MAX_SOURCE_TEXT_CHARS = 40_000;

export interface ResearchedSource {
  url: string;
  requestedUrl: string;
  title: string;
  text: string;
  chars: number;
}

function isPrivateAddress(address: string): boolean {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const normalized = address.toLowerCase();
  return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') ||
    normalized.startsWith('fe80:') || normalized.startsWith('::ffff:127.') || normalized === '::';
}

export function validatePublicHttpUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error(`Invalid source URL: ${rawUrl}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP(S) source URLs are allowed.');
  }
  if (url.username || url.password) {
    throw new Error('Source URLs cannot contain credentials.');
  }
  if (url.hostname === 'localhost' || url.hostname.endsWith('.local')) {
    throw new Error('Local network source URLs are not allowed.');
  }
  if (net.isIP(url.hostname) && isPrivateAddress(url.hostname)) {
    throw new Error('Private network source URLs are not allowed.');
  }
  return url;
}

async function assertPublicHost(url: URL): Promise<void> {
  if (net.isIP(url.hostname)) {
    if (isPrivateAddress(url.hostname)) throw new Error('Private network source URLs are not allowed.');
    return;
  }
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error('Source host resolves to a private or unavailable network.');
  }
}

export function htmlToResearchText(html: string): { title: string; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
  const body = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ')
    .replace(/<\/?(?:p|div|section|article|li|h[1-6]|br|tr|blockquote)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
  return { title: title.replace(/<[^>]+>/g, '').trim(), text: body.slice(0, MAX_SOURCE_TEXT_CHARS) };
}

async function fetchPublicPage(initialUrl: string): Promise<{ url: string; html: string }> {
  let currentUrl = validatePublicHttpUrl(initialUrl);
  for (let redirectCount = 0; redirectCount <= 4; redirectCount += 1) {
    await assertPublicHost(currentUrl);
    const response = await fetch(currentUrl, {
      redirect: 'manual',
      signal: AbortSignal.timeout(12_000),
      headers: { 'user-agent': 'RemotionTrainingStudio/1.0 research' },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error(`Source redirected without a destination: ${currentUrl.href}`);
      currentUrl = validatePublicHttpUrl(new URL(location, currentUrl).href);
      continue;
    }
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}: ${currentUrl.href}`);
    const contentType = response.headers.get('content-type') || '';
    if (!/text\/html|text\/plain/i.test(contentType)) {
      throw new Error('Only HTML and plain-text web sources are supported.');
    }
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (contentLength > MAX_SOURCE_BYTES) throw new Error('Source page exceeds the 1 MB limit.');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Source response did not contain readable content.');
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_SOURCE_BYTES) {
        await reader.cancel();
        throw new Error('Source page exceeds the 1 MB limit.');
      }
      chunks.push(value);
    }
    const merged = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { url: currentUrl.href, html: new TextDecoder().decode(merged) };
  }
  throw new Error('Source URL has too many redirects.');
}

export async function researchSource(rawUrl: string): Promise<ResearchedSource> {
  const page = await fetchPublicPage(rawUrl);
  const extracted = /<html|<!doctype/i.test(page.html)
    ? htmlToResearchText(page.html)
    : { title: new URL(page.url).hostname, text: page.html.slice(0, MAX_SOURCE_TEXT_CHARS).trim() };
  if (extracted.text.length < 40) throw new Error('Source did not contain enough readable text.');
  return {
    url: page.url,
    requestedUrl: validatePublicHttpUrl(rawUrl).href,
    title: extracted.title || new URL(page.url).hostname,
    text: extracted.text,
    chars: extracted.text.length,
  };
}
