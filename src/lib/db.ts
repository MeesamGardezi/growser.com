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
