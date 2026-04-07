// @ts-check

/**
 * Navigation module — URL parsing, search routing, back/forward.
 */
const Navigation = {
  /**
   * Classify user input as a URL, bare domain, or search query.
   * @param {string} input
   * @returns {{ type: 'url' | 'search', url: string }}
   */
  classify(input) {
    const trimmed = input.trim();
    if (!trimmed) {
      console.log('[nav] classify: empty input');
      return { type: 'url', url: '' };
    }

    // Already a full URL
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        console.log('[nav] classify: full URL →', parsed.href);
        return { type: 'url', url: parsed.href };
      }
    } catch { /* not a valid URL */ }

    // Looks like a bare domain (e.g. "example.com", "localhost:3000")
    if (/^[\w-]+(\.[\w-]+)+/.test(trimmed) || /^localhost(:\d+)?/.test(trimmed)) {
      const url = `https://${trimmed}`;
      console.log('[nav] classify: bare domain →', url);
      return { type: 'url', url };
    }

    // Fallback: treat as search query
    console.log('[nav] classify: search query →', trimmed);
    return { type: 'search', url: trimmed };
  },

  /**
   * Build a search URL from a query string.
   * Uses the stored search engine template or falls back to Google.
   * @param {string} query
   * @param {string} [engineTemplate]
   * @returns {string}
   */
  buildSearchUrl(query, engineTemplate = 'https://duckduckgo.com/?q=%s') {
    const url = engineTemplate.replace('%s', encodeURIComponent(query));
    console.log('[nav] buildSearchUrl:', url);
    return url;
  },

  /**
   * Resolve user input into a navigable URL.
   * @param {string} input
   * @param {string} [searchEngine]
   * @returns {string}
   */
  resolve(input, searchEngine) {
    const { type, url } = this.classify(input);
    const result = type === 'url' ? url : this.buildSearchUrl(url, searchEngine);
    console.log('[nav] resolve:', JSON.stringify(input), '→', result);
    return result;
  },
};

window.Navigation = Navigation;
