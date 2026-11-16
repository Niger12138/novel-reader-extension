/** background.js —— 快捷键与默认设置 */

const DEFAULT_SETTINGS = {
  theme: 'sunset',
  fontSize: 20,
  lineHeight: 1.9,
  width: 720,
  letterSpacing: 0.02,
  font: 'serif',
  autoHideBar: true
};

chrome.runtime.onInstalled.addListener(async () => {
  const r = await chrome.storage.local.get('wbn-settings');
  if (!r['wbn-settings']) {
    await chrome.storage.local.set({ 'wbn-settings': DEFAULT_SETTINGS, 'wbn-auto-sites': [] });
  }
});

/** 内容脚本/弹窗的设置同步消息：必须有监听者，否则 sendMessage 会报错 */
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'WBN_SETTINGS_CHANGED') {
    sendResponse({ ok: true });
  }
  return false;
});

/** Alt+R 切换净读 */
chrome.commands.onCommand.addListener(async (command) => {  if (command !== 'toggle-reader') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'WBN_TOGGLE' });
  } catch (e) {
    // 内容脚本未注入（如刚安装后未刷新的页面）
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/adapters.js', 'src/extract.js', 'src/reader.js', 'src/content.js']
      });
      await chrome.tabs.sendMessage(tab.id, { type: 'WBN_TOGGLE' });
    } catch (e2) { /* 受限页面，忽略 */ }
  }
});
