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
    const cands = ['h1', '.bookname h1', '#neirong h1', '.content h1', 'h2'];
    for (const sel of cands) {
      const el = d.querySelector(sel);
      const t = el && (el.textContent || '').trim();
      if (t && t.length >= 3 && t.length <= 80) return t.replace(/\s+/g, ' ');
    }
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

  /** 找上一章/下一章链接（base 用于解析远程文档里的相对地址） */
  function findNav(doc, baseUrl) {
    const d = doc || document;
    const base = baseUrl || (d.location && d.location.href) || location.href;
    const baseNoHash = base.split('#')[0];
    const out = { prev: null, next: null, nextPage: null };
    const anchors = d.querySelectorAll('a[href]');
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      const txt = (a.textContent || '').replace(/\s+/g, '');
      if (!txt || txt.length > 12) continue;
      const href = abs(a.getAttribute('href'), base);
      if (!href || href.split('#')[0] === baseNoHash || href.startsWith('javascript:')) continue;
      // 分页锚优先判定并跳过：绝不能被 next/prev 抢占（否则点下一章会停在本文）
      if (!out.nextPage && WB.nextPagePattern.test(txt)) {
        out.nextPage = { url: href, text: txt };
        continue;
      }
      if (!out.prev && WB.prevPattern.test(txt)) out.prev = { url: href, text: txt };
      else if (!out.next && WB.nextPattern.test(txt)) out.next = { url: href, text: txt };
      if (out.prev && out.next && out.nextPage) break;
    }
    if (!out.next) {
      // 注意：必须查 d（传入的文档），解析远程章节时不能用当前页面
      const rel = d.querySelector('a[rel="next"]');
      if (rel) { const h = abs(rel.getAttribute('href'), base); if (h && h.split('#')[0] !== baseNoHash) out.next = { url: h, text: '下一章' }; }
    }
    return out;
  }

  /** 正文页是否明确提示"本章未完"（分页章节） */
  function hasUnfinishedMarker(text) {
    return /本章未完|请点击下一页|下一页继续|继续阅读下一?页/.test(text);
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
    looksLikeChapter,
    compact,
    cjkCount
  };
})();
