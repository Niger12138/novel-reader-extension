/**
 * adapters.js —— 站点适配器
 *
 * 说明：这里的每一条选择器都来自对真实站点的抓取与分析，不是凭空猜测。
 * 抓取记录见项目根目录 research/ 下的 HTML 快照。
 *
 * 已知的真实模板家族：
 *  1) 杰奇CMS 家族（3zm / bqg9 / biquge5200 / shuquge 等）
 *     章节页：<div id="content" class="showtxt">，正文以 <br /> 分隔，
 *     缩进用全角空格，正文里会混入 <script> 与"首发域名"广告行，
 *     分页容器 .page_chapter。
 *  2) 笔趣阁 365 型（biquge365.net 实测）
 *     章节页：#neirong > #txt，正文以 <br> + &nbsp; 分隔，
 *     body 带 id="moshi" 与 .yanse1 主题类，正文内混入
 *     <p style="font-weight:bold"> 广告行与"（本章未完，请点击下一页）"提示。
 *  3) 新版 bqg 型（xbiqugew.com 实测）
 *     body.novel_info，详情区 .detail-box / .first_txt，章节列表 .row-section。
 *  4) 单页应用型（bqg128.com 实测）
 *     首屏 HTML 只有一个 #loading 占位，正文由 JS 注入 —— 必须等。
 *
 * 适配器只负责"更快更准"，找不到时走 extract.js 的通用打分算法兜底。
 */
(function () {
  const WB = (window.WBNovel = window.WBNovel || {});

  /** 站点适配器：按顺序匹配，第一个命中的生效 */
  WB.adapters = [
    {
      id: 'jieqi-showtxt',
      label: '杰奇CMS / 新笔趣阁',
      // 实测 3zmxsw.cc：<div id="content" class="showtxt">
      match: (d) => !!(d.querySelector('#content.showtxt, .showtxt#content, #content[class*="showtxt"]')),
      content: ['#content.showtxt', '.showtxt#content'],
      title: ['h1', '.bookname h1', '.content h1'],
      remove: ['script', '.page_chapter', '.bottem', '.bottem1', '.bottem2', '.link', '.book.reader > .path']
    },
    {
      id: 'bqg365',
      label: '笔趣阁365',
      // 实测 biquge365.net：<div id="neirong" class="yanse1"><div id="txt">
      match: (d) => !!(d.querySelector('#txt') && (d.body.id === 'moshi' || d.querySelector('#neirong'))),
      content: ['#txt'],
      title: ['#neirong h1', 'h1'],
      remove: [
        'script', '.baocuo', '.gongneng1', '#fanye', '#fanye1',
        '.zhezhao', '.tankuang', '.like', '.footer', '.nav'
      ]
    },
    {
      id: 'biquge-classic',
      label: '传统笔趣阁',
      // 老版笔趣阁/顶点系常见结构
      match: (d) =>
        !!(d.querySelector('#chaptercontent') || d.querySelector('#booktxt') ||
           d.querySelector('#nr1') || d.querySelector('.read-content')),
      content: ['#chaptercontent', '#booktxt', '#nr1', '.read-content'],
      title: ['h1', '.bookname h1', '.content h1'],
      remove: ['script', '.bottem', '.bottem1', '.bottem2', '.page_chapter', '.link']
    },
    {
      id: 'xbiquge-new',
      label: '新版 bqg 模板',
      // 实测 xbiqugew.com：body.novel_info
      match: (d) => !!(d.body.classList.contains('novel_info') && d.querySelector('.first_txt, .detail-box, .row-section')),
      content: ['.first_txt', '.detail-box', '#content'],
      title: ['h1', '.info h1'],
      remove: ['script', '.detail-box .desc', '.page_chapter']
    },
    {
      id: 'shuquge',
      label: '书趣阁 / 书袋型',
      // 实测 xshuquge.net：.wrap 内 .bd 分栏
      match: (d) => !!(d.querySelector('.wrap .bd') && d.querySelector('#content, .showtxt, .read-content')),
      content: ['#content', '.showtxt', '.read-content'],
      title: ['h1'],
      remove: ['script', '.page_chapter']
    }
  ];

  /** 适配器级别的噪音行规则（真实抓取中观察到的固定文案） */
  WB.noisePatterns = [
    /请记住本书首发域名/,
    /最快更新.*?请收藏/,
    /一秒记住.*?更新快.*?无弹窗/,
    /手机版阅读网址/,
    /最新章节.*?请记住/,
    /本章未完.*?下一页/,
    /^\(第\s*\d+\s*\/\s*\d+\s*页\)$/,
    /^（第\s*\d+\s*\/\s*\d+\s*页）$/,
    /天才一秒记住本站地址/,
    /百度搜索.*?最新章节/,
    /加入书签|投推荐票|上一章|下一章|返回目录|章节目录/,
    /^(笔趣阁|新笔趣阁|顶点小说|三掌门|书趣阁).{0,12}$/,
    /^https?:\/\/\S+$/,
    /^www\.\S+$/,
    /^\s*[（(【\[]?\s*(广告|推广|求月票|求订阅|求推荐)\s*[)）】\]]?\s*$/
  ];

  /** 章节标题判定（用于判断"这是不是章节页"） */
  WB.chapterTitlePattern = /第[0-9零一二三四五六七八九十百千万两〇]{1,12}[章节回卷篇]\s*[^\s]{0,40}/;

  /** 上一章/下一章 的锚文本规则 */
  // 注意：prev/next 只认「章」，不认「页」——分页站上「上一页/下一页」若被当作
  // 上一章/下一章，会出现点下一章却停在本文（刷新了内容没变）的 bug。
  WB.prevPattern = /^(上一[章節]|前一章|←\s*上一章|上一章\s*→?|«\s*上一章)/;
  WB.nextPattern = /^(下一[章節]|后一章|下一章\s*→|→\s*下一章|下一章\s*»)/;
  WB.nextPagePattern = /^(下一页|下页|下一頁|继续阅读|点击下一页)/;
})();
