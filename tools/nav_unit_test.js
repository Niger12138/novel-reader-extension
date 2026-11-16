/**
 * findNav 单元测试：在 jsdom 里直接跑真实适配逻辑。
 * 覆盖：真实站点快照 + 手机模板/图标按钮/onclick/rel=next/URL递增/促销陷阱等变体。
 * 运行：node nav_unit_test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const RESEARCH = path.join(ROOT, '..', 'research');

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + '  -> ' + JSON.stringify(detail)); }
}

/** 在指定 base URL 下加载扩展脚本并解析 HTML */
function setup(html, baseUrl) {
  const dom = new JSDOM(html, { url: baseUrl, runScripts: 'outside-only' });
  const ctx = dom.getInternalVMContext();
  const vm = require('vm');
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/adapters.js'), 'utf-8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/extract.js'), 'utf-8'), ctx);
  return { WB: dom.window.WBNovel, doc: dom.window.document };
}

function lastSeg(url) { return url ? url.split('/').pop().split('#')[0] : null; }

/* ---------- 真实站点快照 ---------- */
console.log('\n[真实快照]');
{
  const base = 'https://www.biquge365.net/chapter/11628/019594421.html';
  const html = fs.readFileSync(path.join(RESEARCH, 'bqg365_chapter.html'), 'utf-8');
  const { WB, doc } = setup(html, base);
  const nav = WB.extract.findNav(doc, base);
  check('bqg365 · 下一章识别', nav.next && /01959442[0-9]|\.html/.test(nav.next.url), nav.next);
  check('bqg365 · 上一章识别', !!nav.prev, nav.prev);
  check('bqg365 · 无分页锚时不误造 nextPage', nav.nextPage === null, nav.nextPage);
}
{
  const base = 'https://www.3zmxsw.cc/files/article/html/51483/51483018.html';
  const html = fs.readFileSync(path.join(RESEARCH, 'jq_real_chapter.html'), 'utf-8');
  const { WB, doc } = setup(html, base);
  const nav = WB.extract.findNav(doc, base);
  check('杰奇 · 下一章识别', !!nav.next, nav.next);
  check('杰奇 · 上一章识别', !!nav.prev, nav.prev);
}

/* ---------- 变体 1：手机模板，只有 上一页/下一页 ---------- */
console.log('\n[手机模板 · 上一页/下一页]');
{
  const base = 'https://m.example.com/book/1/100.html';
  const html = `<div id="content">正文正文正文正文正文正文正文正文</div>
    <div class="nav"><a href="/book/1/99.html">上一页</a><a href="/book/1/101.html">下一页</a></div>`;
  const { WB, doc } = setup(html, base);
  const nav = WB.extract.findNav(doc, base);
  check('下一章指向 101.html（而非本文分页样式）',
        nav.next && nav.next.url.endsWith('/101.html') && !/100_\d/.test(nav.next.url), nav.next);
  check('分页锚同时收录到 nextPage', nav.nextPage && nav.nextPage.url.endsWith('101.html'), nav.nextPage);
}

/* ---------- 变体 2：图标按钮（空文本 + title 属性） ---------- */
console.log('\n[图标按钮 · title/alt 属性]');
{
  const base = 'https://www.example.com/book/9/50.html';
  const html = `<div id="content">正文正文正文正文正文正文正文正文</div>
    <div class="bar">
      <a href="/book/9/49.html"><img src="p.png" alt="上一章"></a>
      <a href="/book/9/51.html"><img src="n.png" alt="下一章"></a>
    </div>`;
  const { WB, doc } = setup(html, base);
  const nav = WB.extract.findNav(doc, base);
  check('img alt=下一章 识别', nav.next && nav.next.url.endsWith('51.html'), nav.next);
  check('img alt=上一章 识别', nav.prev && nav.prev.url.endsWith('49.html'), nav.prev);
}

/* ---------- 变体 3：JS onclick 导航 ---------- */
console.log('\n[onclick 跳转]');
{
  const base = 'https://www.example.com/book/9/50.html';
  const html = `<div id="content">正文正文正文正文正文正文正文正文</div>
    <div class="bar">
      <a onclick="location.href='/book/9/51.html'">下一章</a>
      <a href="javascript:void(0)" onclick="location.href='/book/9/49.html'">上一章</a>
    </div>`;
  const { WB, doc } = setup(html, base);
  const nav = WB.extract.findNav(doc, base);
  check('onclick 里的下一章地址', nav.next && nav.next.url.endsWith('51.html'), nav.next);
}

/* ---------- 变体 4：rel=next 标准站 ---------- */
console.log('\n[rel=next]');
{
  const base = 'https://www.example.com/read/1_50.html';
  const html = `<div id="content">正文正文正文正文正文正文正文正文</div>
    <a rel="next" href="/read/1_51.html">»</a>`;
  const { WB, doc } = setup(html, base);
  const nav = WB.extract.findNav(doc, base);
  check('rel=next 兜底', nav.next && nav.next.url.endsWith('1_51.html'), nav.next);
}

/* ---------- 变体 5：无任何导航文本 → URL 递增推断 ---------- */
console.log('\n[URL 递增推断]');
{
  const base = 'https://www.example.com/files/article/html/514/51483.html';
  const html = `<div id="content">正文正文正文正文正文正文正文正文</div>
    <div class="extra"><a href="/files/article/html/514/51484.html">第51484章 神秘来客</a>
    <a href="/files/article/html/999/88888.html">别的书</a></div>`;
  const { WB, doc } = setup(html, base);
  const nav = WB.extract.findNav(doc, base);
  check('同目录 +1 章节推断', nav.next && nav.next.url.endsWith('51484.html'), nav.next);
}
{
  const base = 'https://www.example.com/files/article/html/514/51483/';
  const html = `<div id="content">正文正文正文正文正文正文正文正文</div>
    <div><a href="/files/article/html/514/51482/">上一章内容</a>
    <a href="/files/article/html/514/51484/">随便什么文字</a></div>`;
  const { WB, doc } = setup(html, base);
  const nav = WB.extract.findNav(doc, base);
  check('目录式 URL ±1 推断（下一章）', nav.next && nav.next.url.endsWith('51484/'), nav.next);
  check('目录式 URL ±1 推断（上一章）', nav.prev && nav.prev.url.endsWith('51482/'), nav.prev);
}

/* ---------- 变体 6：促销陷阱（长文本包含「下一章」） ---------- */
console.log('\n[促销陷阱]');
{
  const base = 'https://www.example.com/book/1/100.html';
  const html = `<div id="content">正文正文正文正文正文正文正文正文</div>
    <div class="bar">
      <a href="/book/1/101.html">进入下一章</a>
      <a href="https://t.cn/xxxx">本书下一章更精彩，点我领福利哦</a>
      <a href="/ad.html">下一章精彩抢先看 ></a>
    </div>`;
  const { WB, doc } = setup(html, base);
  const nav = WB.extract.findNav(doc, base);
  check('「进入下一章」识别', nav.next && nav.next.url.endsWith('101.html'), nav.next);
  check('促销长文本不误判', nav.next && !/t\.cn|ad\.html/.test(nav.next.url), nav.next);
}

/* ---------- 变体 7：去空格匹配（下 一 章） ---------- */
console.log('\n[空格变体]');
{
  const base = 'https://www.example.com/book/1/100.html';
  const html = `<div id="content">正文正文正文正文正文正文正文正文</div>
    <a href="/book/1/101.html">下 一 章 &gt;</a><a href="/book/1/99.html">上 一 章</a>`;
  const { WB, doc } = setup(html, base);
  const nav = WB.extract.findNav(doc, base);
  check('「下 一 章」去空格匹配', nav.next && nav.next.url.endsWith('101.html'), nav.next);
  check('「上 一 章」去空格匹配', nav.prev && nav.prev.url.endsWith('99.html'), nav.prev);
}

/* ---------- 变体 8：英文站 next/prev ---------- */
console.log('\n[英文站]');
{
  const base = 'https://www.example.com/chapter/42';
  const html = `<div id="content">some long content paragraph text here for chapter detection</div>
    <nav><a href="/chapter/41">Prev</a><a href="/chapter/43">Next →</a></nav>`;
  const { WB, doc } = setup(html, base);
  const nav = WB.extract.findNav(doc, base);
  check('Next → 识别', nav.next && nav.next.url.endsWith('/chapter/43'), nav.next);
  check('Prev 识别', nav.prev && nav.prev.url.endsWith('/chapter/41'), nav.prev);
}

/* ---------- 变体 9：手机模板 + reader 层兜底逻辑验证 ---------- */
console.log('\n[reader 层 · 下一页归属判断]');
{
  const base = 'https://m.example.com/book/1/100.html';
  const html = `<div id="content">正文正文正文正文正文正文正文正文</div>
    <div class="nav"><a href="/book/1/101.html">下一页</a></div>`;
  const { WB, doc } = setup(html, base);
  const raw = '第一章 开端 ' + '正文'.repeat(50);   // 无分页标记
  const nav = WB.extract.findNav(doc, base);
  const paginated = WB.extract.hasUnfinishedMarker(raw);
  const useAsNext = !paginated && nav.nextPage;
  check('无分页标记 → 下一页可用作下一章', useAsNext && nav.nextPage.url.endsWith('101.html'), nav);
  const paginatedRaw = '第一章 开端 （本章未完，请点击下一页继续阅读）' + '正文'.repeat(50);
  check('有分页标记 → 标记可被识别', WB.extract.hasUnfinishedMarker(paginatedRaw) === true, paginatedRaw);
}

/* ---------- 变体 10：base64 藏文（xbiqugew 形态） ---------- */
console.log('\n[base64 藏文站]');
{
  const b64 = Buffer.from('<p>「方向感极强」说的正是任小粟。</p><p>任小粟心想：“我不需要什么方向感。”</p><p>他一路向西，走过了荒野。</p><p>荒野尽头是一座废弃的图书馆。</p><p>图书馆里还有许多旧书。</p><p>他坐在台阶上读了很久。</p><p>天黑之前终于看到了炊烟。</p><p>炊烟来自一处避难所。</p><p>避难所的门口挂着木牌。</p>', 'utf-8').toString('base64');
  const base = 'https://www.xbiqugew.com/book/15894206/100.html';
  const html = `<div class="word_read"><h3>第1章 起点</h3>
    <script>document.writeln(qsbs.bb('${b64}'));</script>
    <div class="read_btn"><a href="/book/15894206.html">上一章</a><a href="/book/15894206/101.html">下一章</a></div></div>`;
  const { WB, doc } = setup(html, base);
  const n = WB.extract.decodeScriptedContent(doc);
  check('base64 正文解码出 9 个段落', n === 9, n);
  const raw = doc.querySelector('.word_read').textContent;
  check('解码内容为可读中文', raw.includes('任小粟') && raw.includes('避难所'), raw.slice(0, 30));
  check('UTF-8 中文无乱码', !/\u00e[0-9a-f]|æ|ç/.test(raw), raw.slice(0, 20));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
