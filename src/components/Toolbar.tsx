import { createSignal, createEffect } from 'solid-js';
import {
  activeTab,
  canGoBack,
  canGoForward,
  navigateTo,
  navigateBack,
  navigateForward,
  reload,
  toggleVerticalTabs,
} from '../lib/tabs';
import { resolve } from '../lib/navigation';

export default function Toolbar() {
  const [omniboxValue, setOmniboxValue] = createSignal('');
  let omniboxRef!: HTMLInputElement;

  createEffect(() => {
    const tab = activeTab();
    setOmniboxValue(tab?.url ?? '');
  });

  async function doNavigate() {
    const raw = omniboxValue().trim();
    if (!raw) return;
    const url = resolve(raw);
    if (!url) return;
    await navigateTo(url);
    omniboxRef.blur();
  }

  return (
    <div id="toolbar">
      <button id="toggle-sidebar-btn" title="Toggle vertical tabs (⌘⇧B)" onClick={() => toggleVerticalTabs()}>
        &#9776;
      </button>
      <button id="back-btn" title="Back" disabled={!canGoBack()} onClick={() => navigateBack()}>
        &#9664;
      </button>
      <button id="forward-btn" title="Forward" disabled={!canGoForward()} onClick={() => navigateForward()}>
        &#9654;
      </button>
      <button id="refresh-btn" title="Refresh" onClick={() => reload()}>
        &#8635;
      </button>
      <div id="omnibox-wrapper">
        <input
          ref={omniboxRef}
          id="omnibox"
          type="text"
          placeholder="Search or enter URL"
          autocomplete="off"
          spellcheck={false}
          value={omniboxValue()}
          onInput={(e) => setOmniboxValue(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              doNavigate();
            }
          }}
          onFocus={() => omniboxRef.select()}
        />
        <div id="suggestions" class="hidden" />
      </div>
      <button id="go-btn" title="Go" onClick={() => doNavigate()}>
        &#10132;
      </button>
      <button id="menu-btn" title="Menu">
        &#8942;
      </button>
    </div>
  );
}
