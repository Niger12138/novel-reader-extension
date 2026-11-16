/**
 * content.js —— 引导层
 *
 * 职责：
 *  1. 判断当前页是否"小说章节页"（严格判定，避免在普通网页上骚扰）；
 *  2. 注入右下角「阅读模式」入口（白话 + 图标 + 首次气泡提示，照顾不读说明的新手）；
 *  3. 记忆本站是否自动进入；
 *  4. 兼容 SPA / JS 反爬站点：正文晚于首屏注入时用 MutationObserver 等待。
 */
(function () {
  const WB = (window.WBNovel = window.WBNovel || {});
  if (WB.__booted) return;
  WB.__booted = true;

  const KEY_AUTO = 'wbn-auto-sites';
  const KEY_COACH = 'wbn-coach-seen';

  const ICON =
    '<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" ' +
    'stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 6.6C10.5 5.3 8.4 4.6 6 4.6H3.6v13H6c2.4 0 4.5.7 6 2 1.5-1.3 3.6-2 6-2h2.4v-13H18c-2.4 0-4.5.7-6 2Z"/>' +
    '<path d="M12 6.6v13"/></svg>';

  let btn = null;
  let tipTimer = 0;
  let autoTried = false;
  let observer = null;
  let scanTimer = 0;
  let deepOpen = false;   // 深链(?wbn=1 / #wbn)：检测到正文后自动进入

  function host() { return location.hostname; }

  /* ---------- 采集 ---------- */
  function collect() {
    let found = null;
    try { found = WB.extract.findContent(); } catch (e) { return null; }
    if (!found || !found.el) return null;

    let raw = '';
    try { raw = WB.extract.htmlToText(found.el, found.adapter); } catch (e) { return null; }

    const title = WB.extract.getTitle();
    if (!WB.extract.looksLikeChapter(raw, title)) return null;

    const paragraphs = WB.extract.toParagraphs(raw, title);
    if (paragraphs.length < 3) return null;

    return {
      title: title,
      book: WB.extract.getBookName(),
      paragraphs: paragraphs,
      nav: WB.extract.findNav(),
      rawText: raw,
      via: found.via
    };
  }

  /* ---------- 入口按钮 ---------- */
  function makeButton() {
    if (btn && btn.isConnected) return btn;
    const b = document.createElement('button');
    b.id = 'wbn-entry';
    b.type = 'button';
    b.setAttribute('aria-label', '进入阅读模式，只保留正文');
    b.style.cssText = [
      'all:initial',
      'position:fixed', 'right:18px', 'bottom:96px',
      'z-index:2147483645',
      'display:flex', 'align-items:center', 'gap:10px',
      'box-sizing:border-box', 'padding:10px 15px 10px 13px', 'border-radius:16px',
      'border:1px solid rgba(194,112,60,.55)',
      'background:linear-gradient(155deg,rgba(255,250,243,.98),rgba(247,232,214,.96))',
      'color:#8a4b22', 'cursor:pointer', 'text-align:left',
      'font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif',
      'box-shadow:0 10px 28px rgba(120,70,30,.24),0 1px 0 rgba(255,255,255,.7) inset',
      'backdrop-filter:blur(8px)',
      'transition:transform .18s ease, box-shadow .18s ease'
    ].join(';');

    const ico = document.createElement('span');
    ico.style.cssText = 'display:flex;flex:none;align-items:center;justify-content:center;width:21px;height:21px;color:#b4643a';
    ico.innerHTML = ICON;

    const txt = document.createElement('span');
    txt.style.cssText = 'display:flex;flex-direction:column;gap:2px';

    const main = document.createElement('b');
    main.style.cssText = 'display:block;font:700 13.5px/1.1 "PingFang SC","Microsoft YaHei",sans-serif;color:#7a3f1c;letter-spacing:.04em;white-space:nowrap';
    main.textContent = '阅读模式';

    const sub = document.createElement('i');
    sub.style.cssText = 'display:block;font:400 10.5px/1.1 "PingFang SC","Microsoft YaHei",sans-serif;font-style:normal;color:#a7754f;letter-spacing:.06em;white-space:nowrap;margin-top:3px';
    sub.textContent = '只看正文';

    txt.appendChild(main);
    txt.appendChild(sub);
    b.appendChild(ico);
    b.appendChild(txt);

    b.addEventListener('mouseenter', () => {
      b.style.transform = 'translateY(-2px)';
      b.style.boxShadow = '0 14px 34px rgba(120,70,30,.3),0 1px 0 rgba(255,255,255,.7) inset';
    });
    b.addEventListener('mouseleave', () => {
      b.style.transform = 'translateY(0)';
      b.style.boxShadow = '0 10px 28px rgba(120,70,30,.24),0 1px 0 rgba(255,255,255,.7) inset';
    });
    b.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      hideCoach(true);
      enter();
    });

    document.documentElement.appendChild(b);
    btn = b;
    showCoach(b);
    return b;
  }

  /* ---------- 首次使用的气泡提示（新手不读说明，直接告诉他点什么） ---------- */
  async function showCoach(b) {
    let seen = false;
    try { seen = !!(await WB.store.get(KEY_COACH, false)); } catch (e) {}
    if (seen || !b.isConnected) return;

    const tip = document.createElement('span');
    tip.id = 'wbn-tip';
    tip.style.cssText = [
      'position:absolute', 'right:calc(100% + 12px)', 'top:50%',
      'transform:translateY(-50%) translateX(4px)',
      'display:block', 'padding:9px 13px', 'border-radius:11px',
      'background:#3b2f27', 'color:#fdf6ec',
      'font:500 12px/1.45 "PingFang SC","Microsoft YaHei",sans-serif',
      'letter-spacing:.02em', 'white-space:nowrap',
      'box-shadow:0 10px 26px rgba(40,25,15,.28)',
      'pointer-events:none', 'opacity:0', 'transition:opacity .3s ease, transform .3s ease'
    ].join(';');
    tip.textContent = '点这里 → 去掉广告和排版';
    b.appendChild(tip);

    requestAnimationFrame(() => {
      tip.style.opacity = '1';
      tip.style.transform = 'translateY(-50%) translateX(0)';
    });
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => hideCoach(true), 9000);
  }

  function hideCoach(markSeen) {
    const tip = btn && btn.querySelector('#wbn-tip');
    clearTimeout(tipTimer);
    if (tip) {
      tip.style.opacity = '0';
      tip.style.transform = 'translateY(-50%) translateX(4px)';
      setTimeout(() => { if (tip.parentNode) tip.parentNode.removeChild(tip); }, 320);
    }
    if (markSeen) { try { WB.store.set(KEY_COACH, true); } catch (e) {} }
  }

  function removeButton() {
    hideCoach(false);
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
    btn = null;
  }

  /** 点按钮却没找到正文时，用按钮本身报错（比无反应好懂） */
  function flashButton(msg) {
    if (!btn) return;
    const main = btn.querySelector('b');
    if (!main) return;
    const old = main.textContent;
    main.textContent = msg;
    main.style.color = '#a3361f';
    clearTimeout(flashButton._t);
    flashButton._t = setTimeout(() => {
      if (btn && main.isConnected) { main.textContent = old; main.style.color = '#7a3f1c'; }
    }, 2600);
  }

  /* ---------- 进入 ---------- */
  async function enter() {
    if (WB.reader.isOpen()) { WB.reader.close(); return; }
    const data = collect();
    if (!data) {
      flashButton('这页没找到正文');
      return;
    }
    removeButton();
    await WB.reader.open(data);
    watchClose();
  }

  function watchClose() {
    const iv = setInterval(() => {
      if (!WB.reader.isOpen()) {
        clearInterval(iv);
        const d = collect();
        if (d) makeButton();
      }
    }, 800);
  }

  /* ---------- 自动进入 ---------- */
  async function maybeAuto() {
    if (autoTried) return;
    autoTried = true;
    // 刚按退出后被重新载入的页面，不要再自动把人拉回阅读界面
    try {
      if (sessionStorage.getItem('wbn-skip-auto') === '1') {
        sessionStorage.removeItem('wbn-skip-auto');
        return;
      }
    } catch (e) {}
    const list = await WB.store.get(KEY_AUTO, []);
    if (!Array.isArray(list) || list.indexOf(host()) === -1) return;
    const data = collect();
    if (data) { removeButton(); await WB.reader.open(data); watchClose(); }
  }

  /* ---------- 主扫描 ---------- */
  function scan() {
    if (WB.reader.isOpen()) return;
    const data = collect();
    if (data) {
      if (deepOpen && !WB.reader.isOpen()) {
        deepOpen = false;
        removeButton();
        WB.reader.open(data).then(watchClose);
      } else {
        makeButton();
        maybeAuto();
      }
    }
  }

  function scheduleScan(delay) {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, delay || 500);
  }

  /* ---------- SPA / 反爬等待 ---------- */
  function watch() {
    if (observer) return;
    let ticks = 0;
    observer = new MutationObserver(() => {
      ticks++;
      if (ticks % 4 !== 0) return;     // 节流，避免频繁重算
      scheduleScan(600);
    });
    try {
      observer.observe(document.body, { childList: true, subtree: true });
    } catch (e) {}
    // 兜底轮询：部分站点（实测 bqg128）先渲染 #loading，再整体替换内容
    let n = 0;
    const poll = setInterval(() => {
      n++;
      if (WB.reader.isOpen() || n > 20) { clearInterval(poll); return; }
      if (collect()) { clearInterval(poll); scan(); }
    }, 1200);
  }

  /* ---------- 消息 ---------- */
  try {
    chrome.runtime.onMessage.addListener((msg, sender, reply) => {
      if (!msg || !msg.type) return;
      if (msg.type === 'WBN_TOGGLE') {
        enter().then(() => reply({ ok: true, open: WB.reader.isOpen() }));
        return true;
      }
      if (msg.type === 'WBN_OPEN') {
        enter().then(() => reply({ ok: true, open: WB.reader.isOpen() }));
        return true;
      }
      if (msg.type === 'WBN_CLOSE') {
        WB.reader.close(); reply({ ok: true, open: false }); return true;
      }
      if (msg.type === 'WBN_STATE') {
        const d = collect();
        reply({
          ok: true,
          open: WB.reader.isOpen(),
          detected: !!d,
          title: d ? d.title : '',
          chars: d ? d.paragraphs.join('').length : 0,
          via: d ? d.via : ''
        });
        return true;
      }
      if (msg.type === 'WBN_SETTINGS_PUSH') {
        WB.reader.setSettings(msg.settings).then(() => reply({ ok: true }));
        return true;
      }
    });
  } catch (e) {}

  /* ---------- 启动 ---------- */
  function boot() {
    // 深链：?wbn=1 或 #wbn —— 便于测试与外部唤起
    deepOpen = /[?&]wbn=1/.test(location.search) || location.hash === '#wbn';
    const run = () => {
      const data = collect();
      if (data && deepOpen) {
        deepOpen = false;
        removeButton();
        WB.reader.open(data).then(watchClose);
      } else if (data) {
        makeButton();
        maybeAuto();
      }
      watch();
    };
    if (document.readyState === 'complete') setTimeout(run, 300);
    else window.addEventListener('load', () => setTimeout(run, 300), { once: true });

    // 站内跳转（部分站点用 history.pushState）
    let lastHref = location.href;
    setInterval(() => {
      if (location.href !== lastHref) {
        lastHref = location.href;
        autoTried = false;
        if (!WB.reader.isOpen()) { removeButton(); scheduleScan(800); }
      }
    }, 1500);
  }

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
