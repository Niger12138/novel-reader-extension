/** popup.js —— 控制面板（面向"不想读说明"的用户：一句话状态 + 一个大按钮） */

const $ = (id) => document.getElementById(id);
const KEY_SETTINGS = 'wbn-settings';
const KEY_AUTO = 'wbn-auto-sites';
const KEY_LAST = 'wbn-last-read';

let tab = null;
let hostname = '';
let state = { detected: false, open: false };
let settings = {
  theme: 'sunset', fontSize: 20, lineHeight: 1.9,
  width: 720, letterSpacing: 0.02, font: 'serif', autoHideBar: false
};

async function getSettings() {
  const r = await chrome.storage.local.get(KEY_SETTINGS);
  return Object.assign(settings, r[KEY_SETTINGS] || {});
}

async function saveSettings(patch) {
  Object.assign(settings, patch);
  await chrome.storage.local.set({ [KEY_SETTINGS]: settings });
  try { await chrome.tabs.sendMessage(tab.id, { type: 'WBN_SETTINGS_PUSH', settings }); } catch (e) {}
}

async function getAutoSites() {
  const r = await chrome.storage.local.get(KEY_AUTO);
  return Array.isArray(r[KEY_AUTO]) ? r[KEY_AUTO] : [];
}

async function setAuto(on) {
  const list = await getAutoSites();
  const i = list.indexOf(hostname);
  if (on && i === -1) list.push(hostname);
  if (!on && i !== -1) list.splice(i, 1);
  await chrome.storage.local.set({ [KEY_AUTO]: list });
  $('auto').setAttribute('aria-checked', String(on));
}

/** 向内容脚本取状态；失败时尝试注入一次 */
async function fetchState(retry) {
  try {
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'WBN_STATE' });
    if (r && r.ok) return r;
  } catch (e) { /* 内容脚本未注入 */ }

  if (retry) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['src/adapters.js', 'src/extract.js', 'src/reader.js', 'src/content.js']
      });
      await new Promise((r) => setTimeout(r, 350));
      return await fetchState(false);
    } catch (e) { return null; }
  }
  return null;
}

function renderState(s) {
  const status = $('status');
  const cta = $('toggle');
  const hint = $('hint');
  const retry = $('retry');
  retry.hidden = true;

  if (!s) {
    status.className = 'status';
    status.innerHTML = '<b>这一页用不了阅读模式</b><br>浏览器设置页、扩展商店这类页面不允许扩展改动。';
    cta.disabled = true;
    cta.textContent = '换个页面再试';
    hint.textContent = '';
    return;
  }

  if (s.open) {
    status.className = 'status ok';
    status.innerHTML = '<b>正在阅读</b><br>' + (s.title || '本章');
    cta.disabled = false;
    cta.textContent = '退出阅读模式';
    hint.textContent = '也可以按 Esc 直接退出。';
    return;
  }

  if (s.detected) {
    status.className = 'status ok';
    status.innerHTML = '<b>这一页可以净化阅读</b><br>' + s.title + ' · 约 ' +
      Number(s.chars || 0).toLocaleString() + ' 字';
    cta.disabled = false;
    cta.textContent = '开始阅读';
    hint.textContent = '进入后：原站的广告、侧栏、排版全部隐藏，只剩正文。';
  } else {
    status.className = 'status';
    status.innerHTML = '<b>这一页没找到正文</b><br>阅读模式只在<b>小说章节页</b>生效，目录页、书页不生效。';
    cta.disabled = true;
    cta.textContent = '这页用不上';
    hint.textContent = '点开具体的一章，再点扩展图标就行。';
    retry.hidden = false;
  }
}

function fmtTime(ts) {
  const d = new Date(ts || 0);
  if (!ts) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  if (sameDay) return '今天 ' + hm;
  return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 ' + hm;
}

async function paintResume() {
  const r = await chrome.storage.local.get(KEY_LAST);
  const last = r[KEY_LAST];
  if (!last || !last.url || last.url === (tab && tab.url)) return;

  $('resumeCard').hidden = false;
  $('resumeTitle').textContent = (last.book ? last.book + ' · ' : '') + (last.title || '上次的章节');
  $('resumeMeta').textContent = last.host + '　' + fmtTime(last.ts);

  $('resume').addEventListener('click', async () => {
    try {
      await chrome.tabs.update(tab.id, { url: last.url });
    } catch (e) {
      try { await chrome.tabs.create({ url: last.url }); } catch (e2) {}
    }
    window.close();
  });
}

async function main() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  tab = tabs[0];
  if (!tab || !tab.url) return;

  try { hostname = new URL(tab.url).hostname; } catch (e) { hostname = ''; }
  $('site').textContent = hostname || '未知页面';

  await getSettings();
  paintSettings();

  const list = await getAutoSites();
  $('auto').setAttribute('aria-checked', String(list.indexOf(hostname) !== -1));

  const s = await fetchState(true);
  state = s || { detected: false, open: false };
  renderState(s);
  paintResume();

  $('toggle').addEventListener('click', async () => {
    try {
      const type = state.open ? 'WBN_CLOSE' : 'WBN_OPEN';
      let r = null;
      try { r = await chrome.tabs.sendMessage(tab.id, { type }); }
      catch (e) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/adapters.js', 'src/extract.js', 'src/reader.js', 'src/content.js']
        });
        await new Promise((res) => setTimeout(res, 300));
        r = await chrome.tabs.sendMessage(tab.id, { type });
      }
      if (r && r.ok) setTimeout(async () => {
        const s2 = await fetchState(false);
        if (s2) { state = s2; renderState(s2); }
      }, 300);
      if (type === 'WBN_OPEN') window.close();
    } catch (e) {
      $('hint').textContent = '没成功，刷新这个页面后再点一次。';
    }
  });

  $('retry').addEventListener('click', async () => {
    $('status').textContent = '正在重新检测…';
    const s2 = await fetchState(false);
    state = s2 || { detected: false, open: false };
    renderState(s2);
  });

  $('auto').addEventListener('click', async () => {
    const on = $('auto').getAttribute('aria-checked') !== 'true';
    await setAuto(on);
  });

  document.querySelectorAll('.sw').forEach((b) => {
    b.addEventListener('click', () => {
      saveSettings({ theme: b.dataset.theme });
      paintSettings();
    });
  });

  const fs = $('fs');
  fs.addEventListener('input', () => {
    setFont(Number(fs.value));
  });
  $('fsMinus').addEventListener('click', () => setFont(settings.fontSize - 1));
  $('fsPlus').addEventListener('click', () => setFont(settings.fontSize + 1));
}

function setFont(v) {
  const n = Math.max(16, Math.min(30, v));
  saveSettings({ fontSize: n });
  paintSettings();
}

function paintSettings() {
  document.querySelectorAll('.sw').forEach((b) => {
    b.classList.toggle('on', b.dataset.theme === settings.theme);
  });
  $('fs').value = settings.fontSize;
  $('fsv').textContent = settings.fontSize;
}

main().catch((e) => {
  $('status').textContent = '初始化失败：' + e.message;
});
