/**
 * 推荐站点适配性验证：用扩展真实代码跑抓取到的章节页存档。
 * 全部 5 项通过才算「已验证适配」。运行：node verify_sites.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, '..', 'research', 'verified');

const SITES = {
  'biquge365.html': 'https://www.biquge365.net/chapter/39884/86187507.html',
  '3zmxsw.html':    'https://www.3zmxsw.cc/files/article/html/51483/51483017/',
  'xshuquge.html':  'http://www.xshuquge.net/txt/60624/69267089.html',
  'xbiqugew.html':  'https://www.xbiqugew.com/book/15717772/15717774.html'
};

const NAMES = {
  'biquge365.html': '笔趣阁365 (biquge365.net)',
  '3zmxsw.html':    '杰奇CMS (3zmxsw.cc)《帝霸》',
  'xshuquge.html':  '书趣阁 (xshuquge.net)',
  'xbiqugew.html':  '新笔趣阁 (xbiqugew.com)'
};

for (const [file, base] of Object.entries(SITES)) {
  const dom = new JSDOM(fs.readFileSync(path.join(DIR, file), 'utf-8'), { url: base, runScripts: 'outside-only' });
  const ctx = dom.getInternalVMContext();
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/adapters.js'), 'utf-8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/extract.js'), 'utf-8'), ctx);
  const w = dom.window;
  const doc = w.document;
  const E = w.WBNovel.extract;

  E.decodeScriptedContent(doc);   // base64 藏文的站（xbiqugew）先解码
  const found = E.findContent(doc);
  const raw = found ? E.htmlToText(found.el, found.adapter) : '';
  const title = E.getTitle(doc);
  const paras = raw ? E.toParagraphs(raw, title) : [];
  const like = E.looksLikeChapter(raw, title);
  const nav = E.findNav(doc, base);
  const bodyText = paras.join('');
  const hasNoise = /一秒记住|首发域名|w\.w\.w|biquge365\.net|3zmxsw\.cc|笔趣阁.{0,4}首发|（本章未完，请点击下一页继续阅读）/i.test(bodyText);
  const cjk = E.cjkCount(bodyText);

  const checks = {
    '正文定位': !!found,
    '章节判定': like,
    '段落清洗(≥8段)': paras.length >= 8,
    '正文量(≥500字)': cjk >= 500,
    '噪音已过滤': !hasNoise,
    '下一章识别': !!nav.next,
    '上一章识别': !!nav.prev
  };
  const okCount = Object.values(checks).filter(Boolean).length;
  const allOk = okCount === Object.keys(checks).length;
  console.log(`\n【${NAMES[file]}】 ${allOk ? '✅ 全部通过' : '⚠️ ' + okCount + '/' + Object.keys(checks).length}`);
  for (const [k, v] of Object.entries(checks)) console.log(`   ${v ? '✓' : '✗'} ${k}`);
  console.log(`   via=${found && found.via} | 标题="${title.slice(0, 24)}" | ${paras.length}段/${cjk}字`);
  console.log(`   下一章=${nav.next ? nav.next.url.replace(base, '') : '✗无'} | 上一章=${nav.prev ? '✓' : '✗'} | 分页锚=${nav.nextPage ? '有' : '无'}`);
  if (!allOk) process.exitCode = 1;
}
