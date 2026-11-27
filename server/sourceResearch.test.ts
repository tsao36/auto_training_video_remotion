import { describe, expect, it } from 'vitest';
import { htmlToResearchText, validatePublicHttpUrl } from './sourceResearch';

describe('source research safety', () => {
  it('rejects non-http protocols and local hosts', () => {
    expect(() => validatePublicHttpUrl('file:///etc/passwd')).toThrow();
    expect(() => validatePublicHttpUrl('http://localhost/source')).toThrow();
    expect(() => validatePublicHttpUrl('http://127.0.0.1/source')).toThrow();
    expect(() => validatePublicHttpUrl('http://192.168.1.2/source')).toThrow();
  });

  it('accepts public http source URLs', () => {
    expect(validatePublicHttpUrl('https://example.com/specification').hostname).toBe('example.com');
  });
});

describe('htmlToResearchText', () => {
  it('removes executable and decorative markup while preserving useful text', () => {
    const result = htmlToResearchText(`
      <html><head><title>Training Source</title><script>alert('no')</script></head>
      <body><nav>Navigation</nav><article><h1>Concept</h1><p>Evidence &amp; explanation.</p></article>
      <footer>Copyright</footer></body></html>
    `);

    expect(result.title).toBe('Training Source');
    expect(result.text).toContain('Concept');
    expect(result.text).toContain('Evidence & explanation.');
    expect(result.text).not.toContain('alert');
    expect(result.text).not.toContain('Navigation');
  });
});
