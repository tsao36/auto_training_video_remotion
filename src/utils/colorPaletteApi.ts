export interface RandomPaletteResult {
  name: string;
  colors: string[];
  source: string;
}

export async function fetchRandomBrandPalette(signal?: AbortSignal): Promise<RandomPaletteResult> {
  try {
    const response = await fetch('/api/palette/random', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });

    if (response.ok) {
      const data = await response.json() as RandomPaletteResult;
      if (Array.isArray(data.colors) && data.colors.length > 0) return data;
    }
  } catch {
    // Try the public read API directly below when the local Node proxy cannot reach it.
  }

  const offset = Math.floor(Math.random() * 816);
  const upstream = await fetch(`https://www.colorpalettegenerator.ai/api/v1/brands?offset=${offset}&limit=100&_=${Date.now()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!upstream.ok) {
    throw new Error(`Color Palette API 回應 ${upstream.status}`);
  }

  const payload = await upstream.json() as {
    data?: Array<{ name?: string; colors?: Record<string, { hex?: string }> }>;
  };
  const brands = payload.data || [];
  if (brands.length === 0) throw new Error('API 未回傳品牌資料');

  const brand = brands[Math.floor(Math.random() * brands.length)];
  const roles = ['primary', 'secondary', 'accent', 'surface', 'background', 'warning', 'success', 'error'];
  const colors = roles
    .map((role) => brand.colors?.[role]?.hex)
    .filter((color): color is string => typeof color === 'string' && /^#[0-9A-Fa-f]{6}$/.test(color));

  const unique = [...new Set(colors)].slice(0, 5);
  if (unique.length < 2) throw new Error('API 回傳的配色不足');

  return {
    name: brand.name || 'Random brand palette',
    colors: unique,
    source: 'colorpalettegenerator.ai',
  };
}
