import Database from '@tauri-apps/plugin-sql';

let db: Database | null = null;

export async function initDB() {
  db = await Database.load('sqlite:growser.db');
  console.log('[db] connected');
}

export async function select(query: string, bindings: any[] = []): Promise<any[]> {
  if (!db) throw new Error('DB not initialized');
  return db.select(query, bindings);
}

export async function execute(query: string, bindings: any[] = []) {
  if (!db) throw new Error('DB not initialized');
  return db.execute(query, bindings);
}

/** Upsert a page visit into the history table */
export async function recordVisit(url: string, title: string = '') {
  if (!db) return;
  // Check if URL already exists
  const rows: any[] = await db.select(
    'SELECT id, visit_count FROM history WHERE url = $1 LIMIT 1',
    [url],
  );
  if (rows.length > 0) {
    const row = rows[0];
    await db.execute(
      `UPDATE history SET visit_count = $1, last_visited = strftime('%s', 'now'),
       title = CASE WHEN $2 != '' THEN $2 ELSE title END
       WHERE id = $3`,
      [row.visit_count + 1, title, row.id],
    );
  } else {
    await db.execute(
      `INSERT INTO history (url, title, visit_count, last_visited)
       VALUES ($1, $2, 1, strftime('%s', 'now'))`,
      [url, title],
    );
  }
}

/** Save current tabs to session_tabs for restore on next launch */
export async function saveSessionTabs(openTabs: { url: string; title: string; order: number }[]) {
  if (!db) return;
  await db.execute('DELETE FROM session_tabs');
  for (const tab of openTabs) {
    await db.execute(
      `INSERT INTO session_tabs (url, title, tab_order) VALUES ($1, $2, $3)`,
      [tab.url, tab.title, tab.order],
    );
  }
}

/** Load session tabs from the previous session */
export async function loadSessionTabs(): Promise<{ url: string; title: string }[]> {
  if (!db) return [];
  const rows: { url: string; title: string }[] = await db.select(
    'SELECT url, title FROM session_tabs ORDER BY tab_order ASC',
  );
  return rows;
}
