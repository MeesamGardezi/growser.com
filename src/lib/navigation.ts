export function classify(input: string): { type: 'url' | 'search'; url: string } {
  const trimmed = input.trim();
  if (!trimmed) return { type: 'url', url: '' };

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return { type: 'url', url: parsed.href };
    }
  } catch { /* not a valid URL */ }

  if (/^[\w-]+(\.[\w-]+)+/.test(trimmed) || /^localhost(:\d+)?/.test(trimmed)) {
    return { type: 'url', url: `https://${trimmed}` };
  }

  return { type: 'search', url: trimmed };
}

export function buildSearchUrl(query: string, template = 'https://duckduckgo.com/?q=%s'): string {
  return template.replace('%s', encodeURIComponent(query));
}

export function resolve(input: string, searchEngine?: string): string {
  const { type, url } = classify(input);
  return type === 'url' ? url : buildSearchUrl(url, searchEngine);
}
