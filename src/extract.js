/**
 * extract.js —— 正文定位与文本归一化
 *
 * 设计依据（全部来自真实抓取）：
 *  · 正文通常以 <br> 或 <p> 分隔，缩进用 &nbsp; 或全角空格；
 *  · 正文容器里常混入 <script>（广告注入）、"首发域名"提示、
 *    "（本章未完，请点击下一页）"等噪音行；
 *  · 不同站点的容器 id/class 毫无统一标准，因此必须有通用打分为兜底。
 */
(function () {
  const WB = (window.WBNovel = window.WBNovel || {});
  const PUNCT = /[，。！？；：""''…、（）]/g;
  const CJK = /[\u4e00-\u9fa5]/g;

  const HARD_SKIP = 'script,style,noscript,ins,iframe,svg,canvas,button,form,input,textarea,select,audio,video';

  function compact(t) {
    return (t || '').replace(/[\s\u00a0\u3000]/g, '');
  }

  function cjkCount(t) {
    const m = (t || '').match(CJK);
    return m ? m.length : 0;
  }

  /** 元素签名（id + class + name），用于打分 */
  function signature(el) {
    return ((el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '') + ' ' + (el.getAttribute('name') || '')).toLowerCase();
  }

  /**
   * 通用正文打分：字数 + 标点密度 + 段落数，再按签名增减，最后按链接/广告密度惩罚。
   * 这是"适配大部分站"的核心，不依赖任何固定选择器。
   */
  function scoreNode(el) {
    if (!el || el.nodeType !== 1) return 0;
    const tag = el.tagName;
    if (tag === 'BODY' || tag === 'HTML' || tag === 'HEAD') return 0;

    const text = el.textContent || '';
    const len = compact(text).length;
    if (len < 240) return 0;

    let score = len;

    const punct = (text.match(PUNCT) || []).length;
    score += punct * 14;

    const paras = el.querySelectorAll('p, br').length;
    score += Math.min(paras, 80) * 30;

    const sig = signature(el);
    if (/content|chapter|read|txt|text|article|neirong|\bnr\b|booktext|showtxt/.test(sig)) score *= 1.4;
    if (/comment|nav|menu|footer|header|side|recommend|related|\blist\b|hot|rank|\bad\b|banner|breadcrumb|toolbar|login/.test(sig)) score *= 0.3;

    // 链接密度惩罚：导航/目录类容器链接文字占比高
    let linkLen = 0;
    const anchors = el.querySelectorAll('a');
    for (let i = 0; i < anchors.length && i < 300; i++) linkLen += compact(anchors[i].textContent).length;
    const linkRatio = linkLen / Math.max(len, 1);
    if (linkRatio > 0.5) score *= 0.15;
    else if (linkRatio > 0.3) score *= 0.5;

    // 正文里混入的脚本/广告位越多，越可能是被污染的容器
    const junk = el.querySelectorAll('script, ins, iframe').length;
    score -= junk * 40;

    // 超短文本块惩罚（章节标题、按钮）
    if (len < 400) score *= 0.6;

    return score;
  }

  /** 页面是否像"小说章节页" */
  function looksLikeChapter(text, title) {
    const t = compact(text);
    if (t.length < 300) return false;
    const cjk = cjkCount(t);
    if (cjk / Math.max(t.length, 1) < 0.5) return false;
    const punct = (t.match(PUNCT) || []).length;
    if (punct < 8) return false;
    const head = compact(title || '');
    return WB.chapterTitlePattern.test(head) || WB.chapterTitlePattern.test(t.slice(0, 120)) ||
      /chapter|read|\/\d+(_\d+)?\.html?$/i.test(location.pathname);
  }

  /** 用适配器找容器，失败则通用打分 */
  function findContent(doc) {
    const d = doc || document;
    for (const ad of WB.adapters) {
      let ok = false;
      try { ok = ad.match(d); } catch (e) { ok = false; }
      if (!ok) continue;
      for (const sel of ad.content) {
        const el = d.querySelector(sel);
        if (el && compact(el.textContent).length >= 240) {
          return { el, adapter: ad, via: 'adapter:' + ad.id };
        }
      }
    }
    // 通用兜底
    const pool = d.querySelectorAll('div, article, section, td, main');
    let best = null, bestScore = 0;
    const limit = Math.min(pool.length, 1200);
    for (let i = 0; i < limit; i++) {
      const el = pool[i];
      const s = scoreNode(el);
      if (s > bestScore) { bestScore = s; best = el; }
    }
    if (!best || bestScore <= 0) return null;

    // 向上收敛：父节点正文量几乎一致时，向上取，避免漏掉标题/分页
    let cur = best;
    for (let i = 0; i < 3 && cur.parentElement; i++) {
      const p = cur.parentElement;
      if (p.tagName === 'BODY') break;
      const pl = compact(p.textContent).length;
      const cl = compact(cur.textContent).length;
      if (pl > 0 && pl / cl < 1.08 && pl - cl < 400) cur = p;
      else break;
    }
    return { el: cur, adapter: null, via: 'generic' };
  }

  /** 容器 HTML → 纯文本（把 br / 块级标签转成换行，去掉脚本与站点控件） */
  function htmlToText(el, adapter) {
    const clone = el.cloneNode(true);
    const junkSel = [HARD_SKIP].concat((adapter && adapter.remove) || []).join(',');
    try { clone.querySelectorAll(junkSel).forEach((n) => n.remove()); } catch (e) { /* 选择器兼容性兜底 */ }

    // 站内常见噪音块（真实样本里出现过的类名）
    ['#fanye', '#fanye1', '.baocuo', '.gongneng1', '.page_chapter'].forEach((s) => {
      try { clone.querySelectorAll(s).forEach((n) => n.remove()); } catch (e) {}
    });

    clone.querySelectorAll('br').forEach((br) => br.replaceWith(document.createTextNode('\n')));
    clone.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,li,tr,section,article,blockquote,dd,dt,pre,hr,td')
      .forEach((n) => n.appendChild(document.createTextNode('\n')));

    return clone.textContent || '';
  }

  /** 判断一行是否噪音 */
  function isNoise(line) {
    if (!line) return true;
    const l = line.trim();
    if (!l) return true;
    if (WB.noisePatterns.some((re) => re.test(l))) return true;
    // 纯符号 / 分隔线
    if (/^[-=_*·—\s~]{2,}$/.test(l)) return true;
    // 极短且无中文（多为页码、按钮残片）
    if (compact(l).length <= 2 && !cjkCount(l)) return true;
    return false;
  }

  /** 行内噪音（真实站点里"埋在段落中间"的提示语，只剜除该句，不丢整段） */
  const INLINE_NOISE = [
    /（本章未完[^）]{0,30}）|\(本章未完[^)]{0,30}\)/g,
    /请点击下一页继续阅读/g,
    /[（(]\s*第\s*\d+\s*\/\s*\d+\s*页\s*[）)]/g,
    /请记住本书首发域名[：:]?\s*[\w.\-]+\.(?:com|cc|net|org|xyz|top|site|vip|info|la|mobi)/g,
    /手机版阅读网址[：:]?\s*[\w.\-]+\.(?:com|cc|net|org|xyz|top|site|vip|info|la|mobi)/g,
    /一秒记住[^。！\n]{0,40}?(?:更新快|无弹窗)[^。！\n]{0,20}[!！。]?/g,
    /天才一秒记住本站地址[：:]?\s*\S*/g,
    /本站最新网址[：:]?\s*\S*/g
  ];

  function stripInlineNoise(line) {
    let s = line;
    INLINE_NOISE.forEach((re) => { s = s.replace(re, ''); });
    return s.trim();
  }

  /** 归一化为段落数组 */
  function toParagraphs(rawText, title) {
    const normalized = rawText
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')      // &nbsp;
      .replace(/\u3000/g, '  ')     // 全角空格缩进
      .replace(/[ \t]+\n/g, '\n');

    let lines = normalized.split(/\n+/);
    lines = lines.map((s) => stripInlineNoise(s.replace(/^[\s\u3000]+|[\s\u3000]+$/g, ''))).filter(Boolean);

    // 去重：同一行连续重复（分页拼接后的重复标题）
    const seen = new Set();
    const t = compact(title || '');
    const paras = [];
    for (const line of lines) {
      if (isNoise(line)) continue;
      const c = compact(line);
      if (!c) continue;
      if (c.length === t.length && c === t) continue; // 与章节标题重复
      if (/^第[0-9零一二三四五六七八九十百千万两]{1,12}[章节回卷篇]/.test(line) && c.length < 40) continue; // 标题行
      if (seen.has(c) && c.length < 60) continue;
      seen.add(c);
      paras.push(line);
    }
    return paras;
  }

  function getTitle(doc) {
    const d = doc || document;
    const cands = ['h1', '.bookname h1', '#neirong h1', '.content h1', 'h2', 'h3'];
    const pool = [];
    for (const sel of cands) {
      for (const el of d.querySelectorAll(sel)) {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (!t || t.length < 3 || t.length > 80) continue;
        // logo 标题（h1 里套着指向首页的链接，如"笔趣阁"）不配当章节标题
        const a = el.querySelector('a[href]');
        if (a && /^(\/|#|https?:\/\/[^/]+\/?)$/i.test(a.getAttribute('href') || '')) continue;
        // 短文本且不像章节名（如站点名"笔趣阁"）也跳过
        if (t.length <= 6 && !WB.chapterTitlePattern.test(t)) continue;
        pool.push(t);
      }
    }
    // 两轮：先找像章节名的（第X章/第X页），防推荐区标题（"已完结热门小说推荐"）抢位
    for (const t of pool) if (WB.chapterTitlePattern.test(t) || /第.{1,10}[章页節]/.test(t)) return t;
    if (pool.length) return pool[0];
    const dt = (d.title || '').split(/[_|｜\-–—]/)[0].trim();
    return dt || '未命名章节';
  }

  function getBookName(doc) {
    const d = doc || document;
    const el = d.querySelector('.bookname h1, .book h1, .info h1, #info h1, .bname, .book-info h1');
    if (el) {
      const t = (el.textContent || '').trim();
      if (t && t.length <= 40) return t;
    }
    return '';
  }

  function abs(href, base) {
    try { return new URL(href, base || location.href).href; } catch (e) { return null; }
  }

  /**
   * 找上一章/下一章链接。
   * 识别顺序：前缀文本 > 短文本包含 > title/aria-label/img alt 属性
   *          > rel=next > 同目录章节号 +1/-1 推断。
   * 「上一页/下一页」单独归为 prevPage/nextPage，是否算章节导航由 reader 层
   * 结合「本章未完」标记决定（手机模板无分页时它就是上一章/下一章）。
   */
  function findNav(doc, baseUrl) {
    const d = doc || document;
    const base = baseUrl || (d.location && d.location.href) || location.href;
    const baseNoHash = base.split('#')[0];
    const out = { prev: null, next: null, nextPage: null, prevPage: null,
                  prevSoft: null, nextSoft: null };
    const anchors = d.querySelectorAll('a[href], a[onclick]');

    const testAll = (cands) => {
      for (const s of cands) {
        if (!s) continue;
        if (WB.nextPagePattern.test(s)) return { kind: 'nextPage' };
        if (WB.prevPagePattern.test(s)) return { kind: 'prevPage' };
        if (WB.nextPattern.test(s)) return { kind: 'next' };
        if (WB.prevPattern.test(s)) return { kind: 'prev' };
        if (s.length <= 8 && WB.nextContainPattern.test(s)) return { kind: 'nextSoft' };
        if (s.length <= 8 && WB.prevContainPattern.test(s)) return { kind: 'prevSoft' };
      }
      return null;
    };

    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      // href 缺失或为占位时，尝试从 onclick 里抠出跳转地址
      let rawHref = a.getAttribute('href');
      if (!rawHref || rawHref === '#' || rawHref.startsWith('javascript')) {
        const oc = a.getAttribute('onclick') || '';
        const m = oc.match(/location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/);
        if (m) rawHref = m[1];
      }
      if (!rawHref) continue;
      const href = abs(rawHref, base);
      if (!href || href.split('#')[0] === baseNoHash || href.startsWith('javascript:')) continue;

      const img = a.querySelector('img');
      const cands = [
        (a.textContent || '').replace(/\s+/g, ''),
        (a.getAttribute('title') || '').replace(/\s+/g, ''),
        (a.getAttribute('aria-label') || '').replace(/\s+/g, ''),
        img && (img.getAttribute('alt') || img.getAttribute('title') || '').replace(/\s+/g, '')
      ];
      const hit = testAll(cands);
      if (!hit) continue;

      // 分页锚必须带页码语义才收录；「继续阅读」这类词太宽，交给 reader 层判断
      if (hit.kind === 'nextPage' || hit.kind === 'prevPage') {
        const key = hit.kind === 'nextPage' ? 'nextPage' : 'prevPage';
        if (!out[key]) out[key] = { url: href, text: cands[0] || cands[1] || '' };
        continue;
      }
      if (hit.kind === 'nextSoft' || hit.kind === 'prevSoft') {
        const key = hit.kind === 'nextSoft' ? 'nextSoft' : 'prevSoft';
        if (!out[key]) out[key] = { url: href, text: cands[0] || '' };
        if (out.prev && out.next && out[key]) break;
        continue;
      }
      out[hit.kind] = { url: href, text: cands[0] || cands[1] || '' };
      if (out.prev && out.next) break;
    }

    // 前缀匹配没找全时，用短文本包含匹配兜底
    if (!out.next && out.nextSoft) out.next = out.nextSoft;
    if (!out.prev && out.prevSoft) out.prev = out.prevSoft;

    // rel=next / rel=prev（部分标准站）
    if (!out.next) {
      const rel = d.querySelector('a[rel="next"]');
      if (rel) { const h = abs(rel.getAttribute('href'), base); if (h && h.split('#')[0] !== baseNoHash) out.next = { url: h, text: '下一章' }; }
    }
    if (!out.prev) {
      const rel = d.querySelector('a[rel="prev"]');
      if (rel) { const h = abs(rel.getAttribute('href'), base); if (h && h.split('#')[0] !== baseNoHash) out.prev = { url: h, text: '上一章' }; }
    }

    // 最后一道：同目录章节号 +1/-1 推断（文本是图标/图片、或 JS 注入导航的站）
    if (!out.next) { const u = findChapterByStep(d, base, 1); if (u) out.next = { url: u, text: '下一章' }; }
    if (!out.prev) { const u = findChapterByStep(d, base, -1); if (u) out.prev = { url: u, text: '上一章' }; }

    delete out.nextSoft;
    delete out.prevSoft;
    return out;
  }

  /**
   * 章节 URL 递增推断：当前章节 URL 末尾是数字（…/123.html、…/123/），
   * 同目录下数字 ±1 的链接几乎必是相邻章节。用于文本识别失效的站点。
   */
  function findChapterByStep(doc, baseUrl, step) {
    let path, search = '', hash = '';
    try {
      const u = new URL(baseUrl);
      path = u.pathname; search = u.search; hash = '';
    } catch (e) { return null; }
    const m = path.match(/^(.*?)(\d+)((?:_\d+)?)(\.html?)?(\/?)$/);
    if (!m || !m[2]) return null;
    const [, pre, numStr, , ext, slash] = m;
    const n = parseInt(numStr, 10);
    const targetPath = pre + (n + step) + (ext || '') + (slash || '');
    const anchors = doc.querySelectorAll('a[href]');
    for (let i = 0; i < anchors.length; i++) {
      const raw = anchors[i].getAttribute('href');
      if (!raw || raw.startsWith('javascript') || raw === '#') continue;
      let absUrl;
      try { absUrl = new URL(raw, baseUrl); } catch (e) { continue; }
      if (absUrl.pathname === targetPath && (!search || absUrl.search === search)) {
        return absUrl.href;
      }
    }
    return null;
  }

  /** 正文页是否明确提示"本章未完"（分页章节） */
  function hasUnfinishedMarker(text) {
    return /本章未完|请点击下一页|下一页继续|继续阅读下一?页/.test(text);
  }

  /**
   * base64 → UTF-8 文本。注意 atob 只给 Latin-1 串，中文 UTF-8 字节必须再过
   * 一遍 TextDecoder，否则中文全部是乱码（实测踩过的坑）。
   */
  function b64ToUtf8(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    try { return new TextDecoder('utf-8').decode(bytes); }
    catch (e) {
      try { return decodeURIComponent(escape(bin)); } catch (e2) { return bin; }
    }
  }

  /**
   * 解码藏在 script 里的 base64 正文（实测 xbiqugew 等站：
   * <script>document.writeln(qsbs.bb('PHA+...'))</script>，解码即 <p>正文</p>）。
   * 这类站静态 HTML 里没有正文——fetch 翻章时必须先解码再走提取管线。
   * 返回解码出的段落数（0 表示没有此类内容）。
   */
  function decodeScriptedContent(doc) {
    const scripts = [...doc.querySelectorAll('script')];
    let inserted = 0;
    for (const s of scripts) {
      const t = s.textContent || '';
      if (t.length < 60) continue;
      // writeln( xx.bb('base64') ) —— 单参数函数调用且参数是 base64
      const re = /(?:writeln|write)\s*\(\s*[\w$]+(?:\s*\.\s*[\w$]+)+\s*\(\s*['"]([A-Za-z0-9+/=]{40,})['"]\s*\)\s*\)/g;
      let m, html = '';
      while ((m = re.exec(t))) {
        try {
          const decoded = b64ToUtf8(m[1]);
          if (/[\u4e00-\u9fa5]/.test(decoded)) html += decoded;
        } catch (e) {}
      }
      if (!html) continue;
      const tmp = doc.createElement('div');
      tmp.innerHTML = html;
      let n = 0;
      while (tmp.firstChild) { s.parentNode.insertBefore(tmp.firstChild, s); n++; }
      inserted += n;
    }
    return inserted;
  }

  WB.extract = {
    findContent,
    htmlToText,
    toParagraphs,
    isNoise,
    getTitle,
    getBookName,
    findNav,
    hasUnfinishedMarker,
    decodeScriptedContent,
    looksLikeChapter,
    compact,
    cjkCount
  };
})();
