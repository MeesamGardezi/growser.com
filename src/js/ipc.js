// @ts-check

/**
 * IPC module — thin wrapper around Tauri invoke / events.
 */
const IPC = {
  /**
   * Call a Rust command
   * @param {string} cmd
   * @param {Record<string, any>} [args]
   * @returns {Promise<any>}
   */
  async invoke(cmd, args = {}) {
    return window.__TAURI__.core.invoke(cmd, args);
  },

  /**
   * Listen to an event from the backend
   * @param {string} event
   * @param {(payload: any) => void} handler
   * @returns {Promise<() => void>} unlisten function
   */
  async listen(event, handler) {
    return window.__TAURI__.event.listen(event, (e) => handler(e.payload));
  },

  /**
   * Emit an event to the backend
   * @param {string} event
   * @param {any} [payload]
   */
  async emit(event, payload) {
    return window.__TAURI__.event.emit(event, payload);
  },
};

window.IPC = IPC;
