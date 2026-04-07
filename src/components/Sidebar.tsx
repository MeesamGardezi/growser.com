import { For } from 'solid-js';
import { tabs, isVerticalTabs, createTab, switchTo, closeTab } from '../lib/tabs';

function escapeHtml(str: string) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export default function Sidebar() {
  return (
    <div id="sidebar" class={isVerticalTabs() ? '' : 'hidden'}>
      <div id="sidebar-tabs">
        <For each={tabs}>
          {(tab) => (
            <div
              class={`tab${tab.isActive ? ' active' : ''}`}
              onClick={() => switchTo(tab.id)}
            >
              <img
                class="tab-favicon"
                src={tab.favicon || "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22/>"}
                alt=""
              />
              <span class="tab-title" innerHTML={escapeHtml(tab.title)} />
              <button
                class="tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                &times;
              </button>
            </div>
          )}
        </For>
      </div>
      <button id="sidebar-new-tab-btn" title="New Tab (Ctrl+T)" onClick={() => createTab()}>
        + New Tab
      </button>
    </div>
  );
}
