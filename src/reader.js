/**
 * reader.js —— 阅读界面（Shadow DOM）
 *
 * 为什么用 Shadow DOM：
 *   站点普遍用 !important + 全局选择器（如 body#moshi p{...}）控制样式，
 *   用普通 div 覆盖会被打死。Shadow DOM 天然隔离，站点 CSS 进不来、
 *   我们的 CSS 也出不去，真正做到"完全换掉原站阅读形式与主题"。
 *
 * 本轮（用户画像：急躁的新手）重点：
 *   · 首次进入给一张"三句话看懂"的引导卡，含「以后自动进入」一键勾选；
 *   · 翻章改为无刷新加载（不再整页白屏重载、不再回到原站样式）；
 *   · 设置项全部改白话，字号给 A- / A+ 大按钮；
 *   · 顶栏默认常驻，不再自动消失（新手找不到回去的路）。
 */
(function () {
  const WB = (window.WBNovel = window.WBNovel || {});
  const THEMES = [
    { id: 'sunset', name: '暖阳纸' },
    { id: 'night', name: '夜读墨' },
    { id: 'jade', name: '护眼青' },
    { id: 'plain', name: '极简白' },
    { id: 'sakura', name: '樱花粉' },
    { id: 'latte', name: '咖啡奶' },
    { id: 'violet', name: '薰衣紫' },
    { id: 'sea', name: '深海蓝' },
    { id: 'obsidian', name: '曜石黑' },
    { id: 'dusk', name: '晚霞' },
    { id: 'starry', name: '星空' },
    { id: 'celadon', name: '青瓷' },
    { id: 'peach', name: '蜜桃' }
  ];
  const SW_BG = {
    sunset: 'linear-gradient(160deg,#fdf6ec,#f3e2cd)',
    night: 'linear-gradient(160deg,#1b1f27,#0e1013)',
    jade: 'linear-gradient(160deg,#eef3e7,#dfe9d6)',
    plain: 'linear-gradient(160deg,#ffffff,#f2f2f2)',
    sakura: 'linear-gradient(160deg,#fff1f3,#f7dade)',
    latte: 'linear-gradient(160deg,#f8f1e7,#e8d5bf)',
    violet: 'linear-gradient(160deg,#f4f0fb,#e2d9f2)',
    sea: 'linear-gradient(160deg,#22334b,#111a29)',
    obsidian: 'linear-gradient(160deg,#141517,#000000)',
    dusk: 'linear-gradient(160deg,#fff3e2 0%,#ffd9c4 45%,#eec2d8 100%)',
    starry: 'linear-gradient(160deg,#2b2a55,#101228 70%,#0c0e20)',
    celadon: 'linear-gradient(160deg,#eef6f3,#d3e9e0)',
    peach: 'linear-gradient(160deg,#fff4ec,#ffdcca 60%,#f8cfc6)'
  };
  const SW_FG = { night: '#c9cdd6', sea: '#c2cede', obsidian: '#c7c9ce', starry: '#c9cdf0' };
  const FONTS = {
    serif: '"Noto Serif SC","Source Han Serif SC","Songti SC","SimSun",serif',
    sans: '"PingFang SC","Microsoft YaHei",system-ui,sans-serif',
    kai: '"Kaiti SC","KaiTi","STKaiti",serif'
  };
  const DEFAULTS = {
    theme: 'sunset',
    fontSize: 20,
    lineHeight: 1.9,
    width: 720,
    letterSpacing: 0.02,
    font: 'serif',
    autoHideBar: false
  };

  const KEY_SETTINGS = 'wbn-settings';
  const KEY_PROGRESS = 'wbn-progress';
  const KEY_AUTO = 'wbn-auto-sites';
  const KEY_ONBOARDED = 'wbn-onboarded';
  const KEY_LAST = 'wbn-last-read';

  /* ---------------- 存储（chrome.storage 不可用时退回 localStorage） ---------------- */
  const store = {
    async get(key, fallback) {
      try {
        const r = await chrome.storage.local.get(key);
        return r && r[key] !== undefined ? r[key] : fallback;
      } catch (e) {
        try {
          const v = localStorage.getItem(key);
          return v ? JSON.parse(v) : fallback;
        } catch (e2) { return fallback; }
      }
    },
    async set(key, value) {
      try { await chrome.storage.local.set({ [key]: value }); }
      catch (e) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e2) {} }
    }
  };

  const state = {
    open: false,
    host: null,
    root: null,
    data: null,
    settings: Object.assign({}, DEFAULTS),
    idleTimer: 0,
    saveTimer: 0,
    switching: false,
    welcomeShown: false,
    pushed: false
  };

  /* ---------------- 模板 ---------------- */
  const TEMPLATE = `
  <div class="wb-root" data-theme="sunset">
    <div class="wb-progress"><i></i></div>
    <header class="wb-bar">
      <div class="wb-book"><b class="wb-bookname"></b><span class="wb-chapname"></span></div>
      <button class="wb-btn" data-act="prev" title="上一章 ( ← )">‹ 上一章</button>
      <button class="wb-btn" data-act="next" title="下一章 ( → )">下一章 ›</button>
      <button class="wb-btn" data-act="settings" title="设置 ( S )">设置</button>
      <button class="wb-btn primary" data-act="close" title="退出阅读模式 ( Esc )">退出</button>
    </header>
    <div class="wb-scroll">
      <div class="wb-paper">
        <h1 class="wb-h1"></h1>
        <div class="wb-meta"><span class="wb-count"></span><span>·</span><span class="wb-time"></span></div>
        <article class="wb-body"></article>
        <nav class="wb-nav">
          <a data-act="prev">‹ 上一章</a>
          <a data-act="next">下一章 ›</a>
        </nav>
      </div>
    </div>
    <aside class="wb-panel">
      <h2>阅读设置</h2>
      <div class="wb-group">
        <label>背景颜色</label>
        <div class="wb-swatches"></div>
      </div>
      <div class="wb-group">
        <label>字号 <span class="v-fs"></span></label>
        <div class="wb-row">
          <button class="wb-btn wb-step" data-act="fs-dec" title="字小一点">A－</button>
          <input class="wb-range" type="range" min="16" max="30" step="1" data-set="fontSize">
          <button class="wb-btn wb-step" data-act="fs-inc" title="字大一点">A＋</button>
        </div>
      </div>
      <div class="wb-group">
        <label>行间距 <span class="v-lh"></span></label>
        <div class="wb-row">
          <button class="wb-btn wb-step" data-act="lh-dec" title="行距紧一点">紧</button>
          <input class="wb-range" type="range" min="1.4" max="2.6" step="0.1" data-set="lineHeight">
          <button class="wb-btn wb-step" data-act="lh-inc" title="行距松一点">松</button>
        </div>
      </div>
      <div class="wb-group">
        <label>每行字数（页宽） <span class="v-wd"></span></label>
        <input class="wb-range" type="range" min="520" max="1000" step="20" data-set="width">
      </div>
      <div class="wb-group">
        <label>字体</label>
        <div class="wb-row">
          <button class="wb-btn" data-font="serif">宋体</button>
          <button class="wb-btn" data-font="sans">黑体</button>
          <button class="wb-btn" data-font="kai">楷体</button>
        </div>
      </div>
      <div class="wb-group">
        <label>顶部按钮栏</label>
        <div class="wb-row">
          <button class="wb-btn" data-autohide="0">一直显示</button>
          <button class="wb-btn" data-autohide="1">往下读时收起</button>
        </div>
      </div>
      <div class="wb-hint">
        <kbd>←</kbd><kbd>→</kbd> 上一章 / 下一章　<kbd>空格</kbd> 翻页　<kbd>Esc</kbd> 退出<br>
        <kbd>+</kbd><kbd>-</kbd> 调字号　<kbd>T</kbd> 换背景　<kbd>S</kbd> 打开设置
      </div>
    </aside>

    <div class="wb-loading" hidden><i></i><span class="wb-loading-txt">正在加载下一章…</span></div>

    <div class="wb-welcome" hidden>
      <div class="wb-welcome-card">
        <div class="wb-welcome-mark">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor"
            stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 6.6C10.5 5.3 8.4 4.6 6 4.6H3.6v13H6c2.4 0 4.5.7 6 2 1.5-1.3 3.6-2 6-2h2.4v-13H18c-2.4 0-4.5.7-6 2Z"/>
            <path d="M12 6.6v13"/>
          </svg>
        </div>
        <h3>进入纯净阅读</h3>
        <p class="wb-welcome-sub">原站的广告、侧栏和排版都已经被替换掉，这里只有正文。</p>
        <ul class="wb-keys">
          <li><kbd>←</kbd><kbd>→</kbd><span>翻上一章 / 下一章</span></li>
          <li><kbd class="wide">空格</kbd><span>继续往下读</span></li>
          <li><kbd class="wide">Esc</kbd><span>退出，回到原网页</span></li>
          <li><kbd class="wide">设置</kbd><span>在右上角，调字号和背景</span></li>
        </ul>
        <label class="wb-check">
          <input type="checkbox" class="wb-auto-site" checked>
          <span>以后打开本站直接进入阅读模式</span>
        </label>
        <button class="wb-go" data-act="welcome-ok">开始阅读</button>
      </div>
    </div>

    <div class="wb-toast"></div>
  </div>`;

  /* ---------------- 工具 ---------------- */
  function cssURL(path) {
    try { return chrome.runtime.getURL(path); } catch (e) { return null; }
  }

  function fmtCount(n) {
    return n >= 10000 ? (n / 10000).toFixed(1) + ' 万字' : n + ' 字';
  }

  function clearPageEffects() {
    document.documentElement.style.removeProperty('overflow');
    document.documentElement.style.removeProperty('padding-right');
  }

  /* ---------------- 构建 ---------------- */
  function build() {
    const host = document.createElement('div');
    host.id = 'wbn-reader-host';
    host.setAttribute('data-wbn', 'host');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483646;';
    const root = host.attachShadow({ mode: 'open' });

    const cssHref = cssURL('src/reader.css');
    if (cssHref) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = cssHref;
      root.appendChild(link);
    }

    const wrap = document.createElement('div');
    wrap.innerHTML = TEMPLATE;
    while (wrap.firstChild) root.appendChild(wrap.firstChild);

    document.documentElement.appendChild(host);
    state.host = host;
    state.root = root;

    bind(root);
    return root;
  }

  function q(sel) { return state.root.querySelector(sel); }
  function qa(sel) { return Array.prototype.slice.call(state.root.querySelectorAll(sel)); }

  /* ---------------- 设置应用 ---------------- */
  function applySettings() {
    const root = q('.wb-root');
    if (!root) return;
    const s = state.settings;
    root.dataset.theme = s.theme;
    root.style.setProperty('--wb-fs', s.fontSize + 'px');
    root.style.setProperty('--wb-lh', String(s.lineHeight));
    root.style.setProperty('--wb-width', s.width + 'px');
    root.style.setProperty('--wb-ls', s.letterSpacing + 'em');
    root.style.setProperty('--wb-font', FONTS[s.font] || FONTS.serif);

    q('.v-fs').textContent = s.fontSize + 'px';
    q('.v-lh').textContent = Number(s.lineHeight).toFixed(1);
    q('.v-wd').textContent = s.width + 'px';

    qa('.wb-swatch').forEach((b) => b.classList.toggle('on', b.dataset.theme === s.theme));
    qa('[data-font]').forEach((b) => b.classList.toggle('on', b.dataset.font === s.font));
    qa('[data-autohide]').forEach((b) => b.classList.toggle('on', (b.dataset.autohide === '1') === !!s.autoHideBar));

    const r = q('[data-set="fontSize"]'); if (r) r.value = s.fontSize;
    const r2 = q('[data-set="lineHeight"]'); if (r2) r2.value = s.lineHeight;
    const r3 = q('[data-set="width"]'); if (r3) r3.value = s.width;
  }

  async function saveSettings() {
    await store.set(KEY_SETTINGS, state.settings);
    try {
      chrome.runtime.sendMessage({ type: 'WBN_SETTINGS_CHANGED', settings: state.settings });
    } catch (e) {}
  }

  /* ---------------- 内容渲染 ---------------- */
  function render(data) {
    q('.wb-bookname').textContent = data.book ? data.book : '';
    q('.wb-chapname').textContent = data.book ? ' · ' + data.title : data.title;
    q('.wb-h1').textContent = data.title;

    const body = q('.wb-body');
    body.innerHTML = '';
    const frag = document.createDocumentFragment();
    data.paragraphs.forEach((p) => {
      const el = document.createElement('p');
      el.textContent = p;
      frag.appendChild(el);
    });
    body.appendChild(frag);

    const chars = data.paragraphs.join('').length;
    q('.wb-count').textContent = fmtCount(chars);
    q('.wb-time').textContent = '约 ' + Math.max(1, Math.round(chars / 420)) + ' 分钟';

    setNav(data.nav);
    applySettings();
  }

  function setNav(nav) {
    qa('[data-act="prev"]').forEach((b) => {
      const off = !nav || !nav.prev;
      b.classList.toggle('off', off);
      b.disabled = off && b.tagName === 'BUTTON';
      if (off) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
    });
    qa('[data-act="next"]').forEach((b) => {
      const off = !nav || !nav.next;
      b.classList.toggle('off', off);
      b.disabled = off && b.tagName === 'BUTTON';
      if (off) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
    });
  }

  /* ---------------- 进度 ---------------- */
  function progressKey() {
    return location.origin + location.pathname + location.search;
  }

  async function restoreProgress() {
    const map = await store.get(KEY_PROGRESS, {});
    const ratio = map && map[progressKey()];
    if (!ratio || ratio <= 0.01) return;
    const sc = q('.wb-scroll');
    if (!sc) return;
    requestAnimationFrame(() => {
      const max = sc.scrollHeight - sc.clientHeight;
      if (max > 200) sc.scrollTop = max * Math.min(ratio, 0.98);
    });
  }

  function bindScroll() {
    const sc = q('.wb-scroll');
    if (!sc || sc.dataset.bound) return;
    sc.dataset.bound = '1';
    sc.addEventListener('scroll', () => {
      const max = sc.scrollHeight - sc.clientHeight;
      const ratio = max > 0 ? sc.scrollTop / max : 0;
      setProgressBar(ratio);

      clearTimeout(state.saveTimer);
      state.saveTimer = setTimeout(async () => {
        const map = (await store.get(KEY_PROGRESS, {})) || {};
        map[progressKey()] = Number(ratio.toFixed(4));
        const keys = Object.keys(map);
        if (keys.length > 400) delete map[keys[0]];
        store.set(KEY_PROGRESS, map);
      }, 600);

      if (state.settings.autoHideBar && sc.scrollTop > 40) poke(false);
    }, { passive: true });
  }

  function setProgressBar(ratio) {
    const bar = q('.wb-progress i');
    if (bar) bar.style.width = (Math.max(0, Math.min(1, ratio)) * 100).toFixed(2) + '%';
  }

  /* ---------------- 顶栏自动隐藏 ---------------- */
  function poke(show) {
    const root = q('.wb-root');
    if (!root) return;
    if (!state.settings.autoHideBar) { root.classList.remove('is-idle'); return; }
    if (show) {
      root.classList.remove('is-idle');
      clearTimeout(state.idleTimer);
      state.idleTimer = setTimeout(() => {
        const sc = q('.wb-scroll');
        if (sc && sc.scrollTop > 40) root.classList.add('is-idle');
      }, 2200);
    } else {
      root.classList.add('is-idle');
    }
  }

  /* ---------------- 加载中 ---------------- */
  function showLoading(text) {
    const el = q('.wb-loading');
    if (!el) return;
    const t = q('.wb-loading-txt');
    if (t && text) t.textContent = text;
    el.hidden = false;
  }

  function hideLoading() {
    const el = q('.wb-loading');
    if (el) el.hidden = true;
  }

  /* ---------------- 分页合并（真实站点的"本章未完"场景） ---------------- */
  async function mergePages(data) {
    const nav = data.nav || {};
    if (!nav.nextPage || !nav.nextPage.url) return data;
    if (!WB.extract.hasUnfinishedMarker(data.rawText || '')) return data;

    const seen = new Set(data.paragraphs.map((p) => WB.extract.compact(p)));
    let url = nav.nextPage.url;
    let added = 0;

    for (let i = 0; i < 3 && url; i++) {
      let html;
      try {
        const res = await fetch(url, { credentials: 'include' });
        if (!res.ok) break;
        html = await res.text();
      } catch (e) { break; }

      const doc = new DOMParser().parseFromString(html, 'text/html');
      doc.querySelectorAll('script').forEach((s) => s.remove());
      const found = WB.extract.findContent(doc);
      if (!found) break;

      const raw = WB.extract.htmlToText(found.el, found.adapter);
      const paras = WB.extract.toParagraphs(raw, data.title);
      if (!paras.length) break;

      let newCount = 0;
      paras.forEach((p) => {
        const c = WB.extract.compact(p);
        if (c.length < 6) return;
        if (seen.has(c)) return;
        seen.add(c);
        data.paragraphs.push(p);
        newCount++;
      });
      added += newCount;
      if (!newCount) break;

      const nextNav = WB.extract.findNav(doc, url);
      const stillUnfinished = WB.extract.hasUnfinishedMarker(raw);
      url = stillUnfinished && nextNav.nextPage ? nextNav.nextPage.url : null;
    }

    if (added > 0) {
      data.mergedPages = added;
      toast('已自动合并后续分页内容');
    }
    return data;
  }

  /* ---------------- 把远程章节页面解析成阅读数据 ---------------- */
  async function fetchChapter(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    // 部分站（如 xbiqugew）把正文 base64 藏在 script 里靠 JS 注入——先解码，
    // 否则 fetch 解析出的"章节"只有几百字，无刷新翻章会误判失败。
    WB.extract.decodeScriptedContent(doc);
    doc.querySelectorAll('script,noscript').forEach((n) => n.remove());

    const found = WB.extract.findContent(doc);
    if (!found) throw new Error('no content');

    const raw = WB.extract.htmlToText(found.el, found.adapter);
    const title = WB.extract.getTitle(doc);
    const paragraphs = WB.extract.toParagraphs(raw, title);
    if (paragraphs.length < 3) throw new Error('too few paragraphs');

    const book = WB.extract.getBookName(doc) || (state.data && state.data.book) || '';
    return {
      title: title,
      book: book,
      paragraphs: paragraphs,
      nav: WB.extract.findNav(doc, url),
      rawText: raw,
      via: found.via
    };
  }

  /** 无刷新切换章节；失败时退回整页跳转（老办法，但至少能读） */
  async function navigateTo(url, push) {
    if (state.switching || !url) return;
    state.switching = true;
    showLoading('正在加载…');
    try {
      const data = await fetchChapter(url);
      if (push) {
        try { history.pushState({ wbn: 1 }, '', url); state.pushed = true; } catch (e) {}
      }
      state.data = data;
      render(data);
      const sc = q('.wb-scroll');
      if (sc) sc.scrollTop = 0;
      setProgressBar(0);
      saveLastRead(data);
      if (!data.suppressMerge) {
        mergePages(data).then((d) => { if (state.open && state.data === d) render(d); });
      }
      hideLoading();
      state.switching = false;
    } catch (e) {
      hideLoading();
      state.switching = false;
      // 兜底：站点禁止 fetch / 结构异常时整页跳。
      // 但如果目标就是当前页（导航识别异常），刷新只会原地打转——改为提示。
      const cur = location.href.split('#')[0];
      if (url.split('#')[0] === cur) { toast('没有找到下一章'); return; }
      location.href = url;
    }
  }

  function goChapter(kind) {
    const nav = state.data && state.data.nav;
    let target = nav && nav[kind];
    // 手机模板兜底：底部导航只有「上一页/下一页」且本章没有分页标记时，
    // 它们就是上一章/下一章（PC 分页站本章必有「本章未完」标记，不会走到这）。
    if (!target && nav) {
      const paginated = WB.extract.hasUnfinishedMarker(state.data.rawText || '');
      if (kind === 'next' && nav.nextPage && !paginated) target = nav.nextPage;
      if (kind === 'prev' && nav.prevPage && !paginated) target = nav.prevPage;
    }
    if (!target || !target.url) {
      toast(kind === 'prev' ? '已经是第一章了' : '没有找到下一章');
      return;
    }
    // 站点把「下一章」链到目录页（常见于最新一章）——别真的跳过去，直接告知
    try {
      const cur = new URL(location.href);
      const nx = new URL(target.url, location.href);
      const isIndex = /^index(_\d+)?\.html?$/i.test(nx.pathname.split('/').pop() || '');
      if (isIndex && nx.pathname.replace(/[^/]*$/, '') === cur.pathname.replace(/[^/]*$/, '')) {
        toast(kind === 'next' ? '已经是最新章节了' : '已经是第一章了');
        return;
      }
    } catch (e) {}
    navigateTo(target.url, true);
  }

  /* ---------------- 最近阅读（给 popup 的"继续读"用） ---------------- */
  function saveLastRead(data) {
    try {
      store.set(KEY_LAST, {
        url: location.href.split('#')[0],
        title: data.title || '',
        book: data.book || '',
        host: location.hostname,
        ts: Date.now()
      });
    } catch (e) {}
  }

  /* ---------------- 首次引导 ---------------- */
  async function maybeWelcome() {
    if (state.welcomeShown) return;
    state.welcomeShown = true;
    let seen = false;
    try { seen = !!(await store.get(KEY_ONBOARDED, false)); } catch (e) {}
    if (seen) return;
    const w = q('.wb-welcome');
    if (w) w.hidden = false;
  }

  function welcomeOpen() {
    const w = q('.wb-welcome');
    return !!(w && !w.hidden);
  }

  async function dismissWelcome() {
    const w = q('.wb-welcome');
    if (!w || w.hidden) return;
    const auto = q('.wb-auto-site');
    w.hidden = true;
    store.set(KEY_ONBOARDED, true);
    if (auto && auto.checked) {
      try {
        const list = await store.get(KEY_AUTO, []);
        const arr = Array.isArray(list) ? list.slice() : [];
        if (arr.indexOf(location.hostname) === -1) arr.push(location.hostname);
        await store.set(KEY_AUTO, arr);
        toast('已记住：打开 ' + location.hostname + ' 自动进入');
      } catch (e) {}
    }
  }

  /* ---------------- toast ---------------- */
  function toast(msg) {
    const t = q('.wb-toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2400);
  }

  /* ---------------- 事件 ---------------- */
  function bind(root) {
    // 主题色块
    const sw = root.querySelector('.wb-swatches');
    THEMES.forEach((t) => {
      const b = document.createElement('button');
      b.className = 'wb-swatch';
      b.dataset.theme = t.id;
      b.textContent = t.name;
      b.style.background = SW_BG[t.id] || '#fff';
      if (SW_FG[t.id]) b.style.color = SW_FG[t.id];
      b.addEventListener('click', () => {
        state.settings.theme = t.id;
        applySettings();
        saveSettings();
      });
      sw.appendChild(b);
    });

    root.addEventListener('click', async (ev) => {
      const el = ev.target.closest('[data-act],[data-font],[data-autohide]');
      if (!el) {
        // 点击正文区域也可唤出顶栏
        if (ev.target.closest('.wb-scroll')) poke(true);
        return;
      }
      if (el.dataset.font) {
        state.settings.font = el.dataset.font;
        applySettings(); saveSettings(); return;
      }
      if (el.dataset.autohide) {
        state.settings.autoHideBar = el.dataset.autohide === '1';
        applySettings(); saveSettings(); poke(true); return;
      }
      const act = el.dataset.act;
      if (act === 'close') close();
      else if (act === 'welcome-ok') dismissWelcome();
      else if (act === 'settings') {
        const p = q('.wb-panel');
        p.classList.toggle('open');
      } else if (act === 'fs-inc' || act === 'fs-dec') {
        bump(act === 'fs-inc' ? 2 : -2);
      } else if (act === 'lh-inc' || act === 'lh-dec') {
        const d = act === 'lh-inc' ? 0.1 : -0.1;
        state.settings.lineHeight = Number(Math.max(1.4, Math.min(2.6, state.settings.lineHeight + d)).toFixed(1));
        applySettings(); saveSettings();
      } else if (act === 'prev' || act === 'next') {
        goChapter(act);
      }
    });

    root.addEventListener('input', (ev) => {
      const el = ev.target;
      if (!el.dataset || !el.dataset.set) return;
      const key = el.dataset.set;
      const val = parseFloat(el.value);
      state.settings[key] = key === 'lineHeight' ? Number(val.toFixed(1)) : Math.round(val);
      applySettings();
      clearTimeout(bind._t);
      bind._t = setTimeout(saveSettings, 400);
    });

    root.addEventListener('mousemove', () => poke(true));

    // 浏览器后退：趁阅读界面还开着，就地换内容，不打断阅读
    window.addEventListener('popstate', () => {
      if (state.open && !state.switching) navigateTo(location.href, false);
    });
  }

  /* ---------------- 键盘 ---------------- */
  function onKey(ev) {
    if (!state.open) return;
    const tag = (ev.target && ev.target.tagName) || '';
    if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;

    // 引导卡打开时，只允许关闭它，避免误翻章
    if (welcomeOpen()) {
      if (ev.key === 'Escape' || ev.key === 'Enter') { dismissWelcome(); }
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }

    const sc = q('.wb-scroll');
    const page = () => Math.max(320, (sc ? sc.clientHeight : 600) * 0.86);

    switch (ev.key) {
      case 'Escape':
        if (q('.wb-panel').classList.contains('open')) { q('.wb-panel').classList.remove('open'); }
        else close();
        break;
      case 'ArrowLeft':
        goChapter('prev');
        break;
      case 'ArrowRight':
        goChapter('next');
        break;
      case ' ':
      case 'PageDown':
        if (sc) sc.scrollTop += page();
        break;
      case 'PageUp':
        if (sc) sc.scrollTop -= page();
        break;
      case 'ArrowDown':
        if (sc) sc.scrollTop += 90;
        break;
      case 'ArrowUp':
        if (sc) sc.scrollTop -= 90;
        break;
      case '+': case '=':
        bump(1); break;
      case '-': case '_':
        bump(-1); break;
      case 't': case 'T':
        cycleTheme(); break;
      case 's': case 'S':
        q('.wb-panel').classList.toggle('open'); break;
      default: return;
    }
    ev.preventDefault();
    ev.stopPropagation();
  }

  function bump(d) {
    state.settings.fontSize = Math.max(16, Math.min(30, state.settings.fontSize + d));
    applySettings(); saveSettings();
    toast('字号 ' + state.settings.fontSize + 'px');
  }

  function cycleTheme() {
    const ids = THEMES.map((t) => t.id);
    const i = ids.indexOf(state.settings.theme);
    state.settings.theme = ids[(i + 1) % ids.length];
    applySettings(); saveSettings();
    toast('背景：' + THEMES[(i + 1) % ids.length].name);
  }

  /* ---------------- 打开 / 关闭 ---------------- */
  async function open(data) {
    if (state.open) { render(data); return; }

    const saved = await store.get(KEY_SETTINGS, null);
    state.settings = Object.assign({}, DEFAULTS, saved || {});

    build();
    state.data = data;
    state.open = true;

    const de = document.documentElement;
    const sbw = window.innerWidth - de.clientWidth;
    de.style.overflow = 'hidden';
    if (sbw > 0) de.style.paddingRight = sbw + 'px';

    render(data);
    bindScroll();
    restoreProgress();
    q('.wb-scroll').scrollTop = 0;
    poke(true);
    saveLastRead(data);
    maybeWelcome();

    if (!data.suppressMerge) {
      mergePages(data).then((d) => {
        if (state.open) render(d);
      });
    }

    window.addEventListener('keydown', onKey, true);
  }

  function close() {
    if (!state.open) return;
    state.open = false;
    window.removeEventListener('keydown', onKey, true);
    clearTimeout(state.idleTimer);
    if (state.host && state.host.parentNode) state.host.parentNode.removeChild(state.host);
    state.host = null; state.root = null;
    state.welcomeShown = false;
    clearPageEffects();

    // 读过好几章才退出：地址已换成后面的章节，底下的页面却还是进入时那页。
    // 重新载入当前地址，保证退出后看到的就是此刻这一章（顺带压一次"自动进入"，
    // 免得刚按退出就被自动拉回阅读界面）。
    if (state.pushed) {
      state.pushed = false;
      try {
        sessionStorage.setItem('wbn-skip-auto', '1');
        location.reload();
      } catch (e) {}
    }
  }

  WB.reader = {
    open, close,
    goChapter,
    isOpen: () => state.open,
    getSettings: () => state.settings,
    setSettings: async (s) => {
      state.settings = Object.assign({}, state.settings, s || {});
      applySettings();
      await saveSettings();
    },
    toast
  };
  WB.DEFAULTS = DEFAULTS;
  WB.store = store;
})();
