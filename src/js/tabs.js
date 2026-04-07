// @ts-check

/**
 * @typedef {Object} Tab
 * @property {string} id         - Unique tab ID
 * @property {string} url        - Current URL
 * @property {string} title      - Page title
 * @property {string} favicon    - Favicon URL
 * @property {boolean} isActive  - Whether this is the active tab
 */

/**
 * Tab manager — create, close, switch, reorder tabs.
 * Each tab maps to a Tauri Webview (child of the main window).
 */
const TabManager = {
  /** @type {Tab[]} */
  tabs: [],

  /** @type {string|null} */
  activeTabId: null,

  /** Counter for generating unique tab IDs */
  _nextId: 1,

  /** Webview label counter (never reused, even after close) */
  _nextWvId: Date.now(),

  /** @type {Record<string, any>} Webview instances keyed by tab id */
  _webviews: {},

  /** @type {Record<string, string>} Webview labels keyed by tab id */
  _labels: {},

  /** @type {Record<string, string[]>} Per-tab navigation history stacks */
  _tabHistories: {},

  /** @type {Record<string, number>} Current index in each tab's history stack */
  _tabHistoryIdx: {},

  /** Whether vertical tabs mode is active */
  verticalTabs: false,

  /**
   * Create a child webview inside the main window.
   * @param {string} label
   * @param {string} url
   * @param {{ x: number, y: number, width: number, height: number }} rect
   * @returns {Promise<any>}
   */
  async _createWebview(label, url, rect) {
    console.log('[tabs] _createWebview:', label, url, JSON.stringify(rect));
    const { Webview } = window.__TAURI__.webview;
    const { getCurrentWindow } = window.__TAURI__.window;
    const mainWindow = getCurrentWindow();

    // Create the webview at the correct content-area position so it never
    // overlaps the toolbar, even before switchTo() repositions it.
    const webview = new Webview(mainWindow, label, {
      url,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });

    // Wait for creation with a timeout so we don't hang forever
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('[tabs] _createWebview timed out for', label);
        reject(new Error(`Webview creation timed out: ${label}`));
      }, 10000);

      webview.once('tauri://created', () => {
        clearTimeout(timeout);
        console.log('[tabs] webview created event:', label);
        resolve(undefined);
      });
      webview.once('tauri://error', (/** @type {any} */ e) => {
        clearTimeout(timeout);
        console.error('[tabs] webview error event:', label, e);
        reject(e);
      });
    });

    // Hide until switchTo positions and shows it
    await webview.hide();
    console.log('[tabs] _createWebview done (hidden):', label);
    return webview;
  },

  /**
   * Create a new tab.
   * @param {string} [url='']
   * @returns {Promise<Tab>}
   */
  async createTab(url = '') {
    const id = `tab-${this._nextId++}`;
    const wvLabel = `wv-${this._nextWvId++}`;
    console.log('[tabs] createTab:', id, wvLabel, url || '(new tab)');

    /** @type {Tab} */
    const tab = {
      id,
      url: url || '',
      title: 'New Tab',
      favicon: '',
      isActive: false,
    };

    this.tabs.push(tab);
    this._renderTabs();

    const rect = this._getContentRect();
    // Use the same origin as the main window so assets resolve in both dev and prod
    const wvUrl = url || `${window.location.origin}/pages/newtab.html`;
    try {
      const webview = await this._createWebview(wvLabel, wvUrl, rect);
      this._webviews[id] = webview;
      this._labels[id] = wvLabel;
    } catch (err) {
      console.error('[tabs] createTab: webview creation failed:', err);
      // Remove the tab we just added since the webview failed
      this.tabs.splice(this.tabs.indexOf(tab), 1);
      this._renderTabs();
      throw err;
    }

    // Initialize this tab's history stack
    if (url) {
      this._tabHistories[id] = [url];
      this._tabHistoryIdx[id] = 0;
    } else {
      this._tabHistories[id] = [];
      this._tabHistoryIdx[id] = -1;
    }

    await this.switchTo(id);
    console.log('[tabs] createTab complete:', id);
    return tab;
  },

  /**
   * Navigate the active tab to a new URL.
   * Calls the Rust `navigate_webview` command so the webview stays alive.
   * @param {string} url
   */
  async navigateTo(url) {
    console.log('[tabs] navigateTo:', url);
    const tab = this.tabs.find((t) => t.id === this.activeTabId);
    if (!tab) {
      console.warn('[tabs] navigateTo: no active tab found');
      return;
    }

    const label = this._labels[tab.id];
    if (!label) {
      console.warn('[tabs] navigateTo: no webview label for active tab');
      return;
    }

    // Navigate the existing webview via Rust — no destroy/recreate
    await window.__TAURI__.core.invoke('navigate_webview', { label, url });
    console.log('[tabs] navigateTo: navigate_webview invoked');

    // Update JS history: truncate forward entries, push new URL
    const id = tab.id;
    const idx = this._tabHistoryIdx[id] ?? -1;
    const stack = this._tabHistories[id] ?? [];
    stack.splice(idx + 1);
    stack.push(url);
    this._tabHistories[id] = stack;
    this._tabHistoryIdx[id] = stack.length - 1;

    tab.url = url;
    tab.title = url;
    this._renderTabs();
    this._updateNavButtons();

    const omnibox = /** @type {HTMLInputElement} */ (document.getElementById('omnibox'));
    if (omnibox) omnibox.value = url;

    console.log('[tabs] navigateTo complete:', url);
  },

  /**
   * Navigate the active tab one step back in its history.
   */
  async navigateBack() {
    const id = this.activeTabId;
    if (!id) return;
    const idx = this._tabHistoryIdx[id] ?? -1;
    if (idx <= 0) return;

    const newIdx = idx - 1;
    const url = this._tabHistories[id][newIdx];
    this._tabHistoryIdx[id] = newIdx;

    const label = this._labels[id];
    if (label) await window.__TAURI__.core.invoke('navigate_webview', { label, url });

    const tab = this.tabs.find((t) => t.id === id);
    if (tab) { tab.url = url; tab.title = url; }

    const omnibox = /** @type {HTMLInputElement} */ (document.getElementById('omnibox'));
    if (omnibox) omnibox.value = url;

    this._renderTabs();
    this._updateNavButtons();
  },

  /**
   * Navigate the active tab one step forward in its history.
   */
  async navigateForward() {
    const id = this.activeTabId;
    if (!id) return;
    const stack = this._tabHistories[id] ?? [];
    const idx = this._tabHistoryIdx[id] ?? -1;
    if (idx >= stack.length - 1) return;

    const newIdx = idx + 1;
    const url = stack[newIdx];
    this._tabHistoryIdx[id] = newIdx;

    const label = this._labels[id];
    if (label) await window.__TAURI__.core.invoke('navigate_webview', { label, url });

    const tab = this.tabs.find((t) => t.id === id);
    if (tab) { tab.url = url; tab.title = url; }

    const omnibox = /** @type {HTMLInputElement} */ (document.getElementById('omnibox'));
    if (omnibox) omnibox.value = url;

    this._renderTabs();
    this._updateNavButtons();
  },

  /**
   * Reload the active tab by re-navigating to its current URL.
   */
  async reload() {
    const id = this.activeTabId;
    if (!id) return;
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) return;
    const label = this._labels[id];
    if (!label) return;
    const target = tab.url || `${window.location.origin}/pages/newtab.html`;
    await window.__TAURI__.core.invoke('navigate_webview', { label, url: target });
    console.log('[tabs] reload:', target);
  },

  /**
   * Close a tab by ID.
   * @param {string} id
   */
  async closeTab(id) {
    console.log('[tabs] closeTab:', id);
    const idx = this.tabs.findIndex((t) => t.id === id);
    if (idx === -1) { console.warn('[tabs] closeTab: tab not found', id); return; }

    const wv = this._webviews[id];
    if (wv) {
      await wv.close();
      delete this._webviews[id];
      delete this._labels[id];
    }
    // Clean up per-tab history to avoid memory leaks
    delete this._tabHistories[id];
    delete this._tabHistoryIdx[id];
    this.tabs.splice(idx, 1);

    if (this.tabs.length === 0) {
      await this.createTab();
      return;
    }

    if (this.activeTabId === id) {
      const nextIdx = Math.min(idx, this.tabs.length - 1);
      await this.switchTo(this.tabs[nextIdx].id);
    } else {
      this._renderTabs();
    }
  },

  /**
   * Switch to a tab by ID.
   * @param {string} id
   */
  async switchTo(id) {
    console.log('[tabs] switchTo:', id);
    const tab = this.tabs.find((t) => t.id === id);
    if (!tab) { console.warn('[tabs] switchTo: tab not found', id); return; }

    this.activeTabId = id;
    this.tabs.forEach((t) => (t.isActive = t.id === id));
    this._renderTabs();

    // Update omnibox
    const omnibox = /** @type {HTMLInputElement} */ (document.getElementById('omnibox'));
    if (omnibox) omnibox.value = tab.url;

    // Show active webview, hide all others.
    // Ensure layout is up-to-date before reading geometry.
    await new Promise((r) => requestAnimationFrame(r));
    const rect = this._getContentRect();
    console.log('[tabs] switchTo rect:', JSON.stringify(rect));
    const { LogicalPosition, LogicalSize } = window.__TAURI__.dpi;

    for (const t of this.tabs) {
      const wv = this._webviews[t.id];
      if (!wv) continue;
      if (t.id === id) {
        console.log('[tabs] positioning webview', t.id, 'at', rect.x, rect.y, rect.width, rect.height);
        // Show first, then reposition — setPosition may be ignored on
        // hidden webviews on some platforms.
        await wv.show();
        await wv.setPosition(new LogicalPosition(rect.x, rect.y));
        await wv.setSize(new LogicalSize(rect.width, rect.height));
        console.log('[tabs] webview shown:', t.id);
      } else {
        await wv.hide();
      }
    }

    this._updateNavButtons();
  },

  /**
   * Update the enabled/disabled state of the back and forward toolbar buttons.
   */
  _updateNavButtons() {
    const id = this.activeTabId;
    const backBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('back-btn'));
    const fwdBtn = /** @type {HTMLButtonElement|null} */ (document.getElementById('forward-btn'));
    if (!id) {
      if (backBtn) backBtn.disabled = true;
      if (fwdBtn) fwdBtn.disabled = true;
      return;
    }
    const idx = this._tabHistoryIdx[id] ?? -1;
    const len = (this._tabHistories[id] ?? []).length;
    if (backBtn) backBtn.disabled = idx <= 0;
    if (fwdBtn) fwdBtn.disabled = idx >= len - 1;
  },

  /**
   * Toggle between horizontal and vertical tabs.
   */
  async toggleVerticalTabs() {
    this.verticalTabs = !this.verticalTabs;

    const shell = document.getElementById('shell');
    const sidebar = document.getElementById('sidebar');
    if (shell && sidebar) {
      if (this.verticalTabs) {
        shell.classList.add('vertical-tabs');
        sidebar.classList.remove('hidden');
      } else {
        shell.classList.remove('vertical-tabs');
        sidebar.classList.add('hidden');
      }
    }

    this._renderTabs();

    // Reposition webviews since content-area geometry changed
    if (this.activeTabId) {
      await this.switchTo(this.activeTabId);
    }
  },

  /** Render the tab strip UI */
  _renderTabs() {
    const strip = document.getElementById('tab-strip');
    const sidebarTabs = document.getElementById('sidebar-tabs');

    // Build tab elements
    /** @param {Tab} tab */
    const buildTabEl = (tab) => {
      const el = document.createElement('div');
      el.className = `tab${tab.isActive ? ' active' : ''}`;
      el.dataset.tabId = tab.id;

      el.innerHTML = `
        <img class="tab-favicon" src="${tab.favicon || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22/>'}" alt="" />
        <span class="tab-title">${this._escapeHtml(tab.title)}</span>
        <button class="tab-close" data-close="${tab.id}">&times;</button>
      `;

      el.addEventListener('click', (e) => {
        if (/** @type {HTMLElement} */ (e.target).dataset.close) return;
        this.switchTo(tab.id);
      });

      const closeBtn = el.querySelector('.tab-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeTab(tab.id);
        });
      }

      return el;
    };

    // Render horizontal
    if (strip) {
      strip.innerHTML = '';
      for (const tab of this.tabs) {
        strip.appendChild(buildTabEl(tab));
      }
    }

    // Render vertical
    if (sidebarTabs) {
      sidebarTabs.innerHTML = '';
      for (const tab of this.tabs) {
        sidebarTabs.appendChild(buildTabEl(tab));
      }
    }
  },

  /**
   * Lightweight reposition of the active webview without hiding/showing all tabs.
   * Used during window resize to avoid expensive full switchTo cycles.
   */
  async _resizeActiveWebview() {
    const id = this.activeTabId;
    if (!id) return;
    const wv = this._webviews[id];
    if (!wv) return;

    const rect = this._getContentRect();
    const { LogicalPosition, LogicalSize } = window.__TAURI__.dpi;
    await wv.setPosition(new LogicalPosition(rect.x, rect.y));
    await wv.setSize(new LogicalSize(rect.width, rect.height));
  },

  /**
   * Get the bounding rectangle of the content area (where webviews render).
   * @returns {{ x: number, y: number, width: number, height: number }}
   */
  _getContentRect() {
    const el = document.getElementById('content-area');
    if (!el) {
      console.error('[tabs] _getContentRect: #content-area not found');
      return { x: 0, y: 0, width: 800, height: 600 };
    }
    const r = el.getBoundingClientRect();
    const rect = {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
    console.log('[tabs] _getContentRect:', rect);
    return rect;
  },

  /**
   * Escape HTML to prevent XSS in tab titles.
   * @param {string} str
   * @returns {string}
   */
  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },
};

window.TabManager = TabManager;
