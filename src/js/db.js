// @ts-check
/// <reference types="@anthropic-ai/sdk" />

/**
 * Database module — wraps @tauri-apps/plugin-sql for the shell.
 * Exposes a single `db` object after init.
 */

/** @type {import('@tauri-apps/plugin-sql').default | null} */
let _db = null;

const DB = {
  /** Initialize the database connection */
  async init() {
    const Database = window.__TAURI__.sql.default ?? window.__TAURI__.sql;
    _db = await Database.load('sqlite:growser.db');
    console.log('[db] connected');
  },

  /**
   * Run a SELECT query
   * @param {string} query
   * @param {any[]} [bindings]
   * @returns {Promise<any[]>}
   */
  async select(query, bindings = []) {
    if (!_db) throw new Error('DB not initialized');
    return _db.select(query, bindings);
  },

  /**
   * Run an INSERT / UPDATE / DELETE
   * @param {string} query
   * @param {any[]} [bindings]
   * @returns {Promise<import('@tauri-apps/plugin-sql').QueryResult>}
   */
  async execute(query, bindings = []) {
    if (!_db) throw new Error('DB not initialized');
    return _db.execute(query, bindings);
  },
};

window.DB = DB;
