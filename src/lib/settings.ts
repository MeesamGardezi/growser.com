import { createSignal } from 'solid-js';
import { select, execute } from './db';

// ─── Reactive settings signals ───

export const [homepage, setHomepage] = createSignal('newtab');
export const [searchEngine, setSearchEngine] = createSignal('https://www.google.com/search?q=%s');
export const [theme, setTheme] = createSignal<'light' | 'dark' | 'system'>('system');

/** Load all settings from DB and apply them */
export async function loadSettings() {
  try {
    const rows: { key: string; value: string }[] = await select(
      'SELECT key, value FROM settings',
    );
    for (const { key, value } of rows) {
      switch (key) {
        case 'homepage':
          setHomepage(value);
          break;
        case 'search_engine':
          setSearchEngine(value);
          break;
        case 'theme':
          setTheme(value as 'light' | 'dark' | 'system');
          break;
      }
    }
  } catch (err) {
    console.error('[settings] loadSettings failed:', err);
  }
  applyTheme();
}

/** Persist a setting to DB and update the reactive signal */
export async function setSetting(key: string, value: string) {
  await execute(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT(key) DO UPDATE SET value = $2`,
    [key, value],
  );
  switch (key) {
    case 'homepage':
      setHomepage(value);
      break;
    case 'search_engine':
      setSearchEngine(value);
      break;
    case 'theme':
      setTheme(value as 'light' | 'dark' | 'system');
      applyTheme();
      break;
  }
}

/** Apply the theme to the document root */
function applyTheme() {
  const t = theme();
  if (t === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', t);
  }
}
