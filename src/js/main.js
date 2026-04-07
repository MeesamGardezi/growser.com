// @ts-check
/* global DB, TabManager, Navigation */

/**
 * Main entry point — wires everything together on DOMContentLoaded.
 */
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[main] DOMContentLoaded fired');

  // 1. Initialize database
  try {
    await DB.init();
    console.log('[main] DB ready');
  } catch (err) {
    console.error('[main] DB init failed:', err);
  }

  // 2. Open the first tab
  try {
    await TabManager.createTab();
  } catch (err) {
    console.error('[main] Failed to create initial tab:', err);
  }

  // 3. Wire up toolbar
  const omnibox = /** @type {HTMLInputElement} */ (document.getElementById('omnibox'));
  const newTabBtn = document.getElementById('new-tab-btn');
  const sidebarNewTabBtn = document.getElementById('sidebar-new-tab-btn');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
  const goBtn = document.getElementById('go-btn');
  const backBtn = /** @type {HTMLButtonElement} */ (document.getElementById('back-btn'));
  const forwardBtn = /** @type {HTMLButtonElement} */ (document.getElementById('forward-btn'));
  const refreshBtn = document.getElementById('refresh-btn');

  /**
   * Navigate the active tab to whatever is in the omnibox.
   */
  async function doNavigate() {
    const raw = omnibox.value.trim();
    console.log('[main] doNavigate called, raw value:', JSON.stringify(raw));
    if (!raw) {
      console.warn('[main] doNavigate: empty input, aborting');
      return;
    }
    const url = Navigation.resolve(raw);
    console.log('[main] resolved URL:', url);
    if (!url) {
      console.warn('[main] doNavigate: resolve returned empty, aborting');
      return;
    }
    console.log('[main] activeTabId:', TabManager.activeTabId);
    console.log('[main] webview label:', TabManager._labels[TabManager.activeTabId ?? '']);
    try {
      await TabManager.navigateTo(url);
      console.log('[main] navigateTo completed successfully');
    } catch (err) {
      console.error('[main] navigateTo failed:', err);
    }
    omnibox.blur();
  }

  // Omnibox: navigate on Enter
  omnibox.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      console.log('[main] Enter keydown fired');
      e.preventDefault();
      await doNavigate();
    }
  });

  // Go button
  goBtn?.addEventListener('click', async () => {
    console.log('[main] Go button clicked');
    await doNavigate();
  });

  // Omnibox: select all on focus
  omnibox.addEventListener('focus', () => omnibox.select());

  // New tab button (horizontal)
  newTabBtn?.addEventListener('click', () => TabManager.createTab());

  // New tab button (vertical sidebar)
  sidebarNewTabBtn?.addEventListener('click', () => TabManager.createTab());

  // Toggle vertical tabs
  toggleSidebarBtn?.addEventListener('click', () => TabManager.toggleVerticalTabs());

  // Back / Forward / Refresh
  backBtn?.addEventListener('click', () => TabManager.navigateBack());
  forwardBtn?.addEventListener('click', () => TabManager.navigateForward());
  refreshBtn?.addEventListener('click', () => TabManager.reload());

  // 4. Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    const mod = isMac ? e.metaKey : e.ctrlKey;

    if (mod && e.key === 't') {
      e.preventDefault();
      TabManager.createTab();
    }
    if (mod && e.key === 'w') {
      e.preventDefault();
      if (TabManager.activeTabId) TabManager.closeTab(TabManager.activeTabId);
    }
    if (mod && e.key === 'l') {
      e.preventDefault();
      omnibox.focus();
      omnibox.select();
    }
    if (mod && e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      TabManager.toggleVerticalTabs();
    }
  });

  // 5. Reposition active tab on window resize
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      TabManager._resizeActiveWebview();
    }, 150);
  });

  console.log('[main] Growser ready');
});
