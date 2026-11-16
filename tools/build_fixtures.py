# -*- coding: utf-8 -*-
"""从真实抓取的章节页生成离线测试 fixture（保留真实结构与噪音）"""
import re, os

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'research')
EXT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'test')
os.makedirs(EXT, exist_ok=True)

# ---------- 1) 杰奇CMS 型（来自 3zmxsw.cc 真实结构） ----------
jieqi = open(os.path.join(BASE, 'jq_real_chapter.html'), encoding='utf-8', errors='ignore').read()
m = re.search(r'<div[^>]*id="content"[^>]*>(.*?)<div class="page_chapter">', jieqi, re.S)
content_inner = m.group(1) if m else '<script>app2();</script><br />（正文提取失败）'

# 该真实样本的 #content 是"章节报错"占位（只有广告行），这里换入 bqg365 抓到的真实小说文本，
# 但完整保留杰奇站的真实噪音特征：<script> 注入、全角缩进、<br /> 分隔、域名广告行
bqg_raw = open(os.path.join(BASE, 'bqg365_chapter.html'), encoding='utf-8', errors='ignore').read()
m_txt = re.search(r'<div\s+id="txt"[^>]*>(.*?)</div>', bqg_raw, re.S)
prose_html = m_txt.group(1) if m_txt else '测试正文'
# 关键：先把 <br> 变体换成换行，再剥其余标签
prose = re.sub(r'<br\s*/?>', '\n', prose_html)
prose = re.sub(r'<[^>]+>', '', prose)
prose_lines = [
    l.strip() for l in re.sub(r'&nbsp;', '', prose).split('\n')
    if len(l.strip()) > 40
][:14]
jieqi_body = (
    '<script>app2();</script><br /><br />'
    + '<br />'.join('　　' + l for l in prose_lines)
    + '<br /><br /><script>chaptererror();</script><br />'
    + '　　请记住本书首发域名：www.3zmtxt.cc。三掌门手机版阅读网址：wap.3zmtxt.cc'
)

jieqi_html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>第七章 雪山之行_测试书名_杰奇模板</title>
<style>
body{{background:#f2f2f2;font-family:SimSun;margin:0}}
.header{{background:#333;color:#eee;padding:10px 20px}}
.wrap{{width:950px;margin:0 auto}}
.content{{background:#fff;padding:30px;border:1px solid #ccc}}
#content.showtxt{{font-size:18px;line-height:2}}
.page_chapter{{padding:16px;background:#f7f7f7}}
.footer{{padding:20px;color:#999;text-align:center}}
.sidebar{{position:fixed;right:0;top:120px;width:180px;background:#fffbe6;border:1px solid #e0c060;padding:10px}}
</style></head>
<body id="wrapper">
<div class="header"><div class="wrap">杰奇CMS 测试站 · 顶栏导航</div></div>
<div class="wrap">
  <div class="book reader">
    <div class="path"><a href="#">首页</a> &gt; <a href="#">分类</a> &gt; 测试书名</div>
    <h1>第七章 雪山之行</h1>
    <div class="content">
      <div id="content" class="showtxt">{jieqi_body}</div>
    </div>
    <div class="page_chapter">
      <a href="jieqi-demo.html#p2">上一页</a>
      <a href="#">目录</a>
      <a href="jieqi-demo.html#p2">下一页</a>
      <a href="jieqi-demo.html">上一章</a>
      <a href="bqg365-demo.html">下一章</a>
    </div>
  </div>
</div>
<aside class="sidebar">站内广告位<br>点此注册会员<br>最新网址发布页</aside>
<div class="footer">杰奇CMS 测试页脚 · 请记住本书首发域名 www.example.com</div>
</body></html>"""
open(os.path.join(EXT, 'jieqi-demo.html'), 'w', encoding='utf-8').write(jieqi_html)
print('jieqi-demo.html  正文块长度:', len(re.sub(r'<[^>]+>', '', jieqi_body)))

# ---------- 2) 笔趣阁365 型（来自 biquge365.net 真实结构） ----------
bqg = open(os.path.join(BASE, 'bqg365_chapter.html'), encoding='utf-8', errors='ignore').read()
m2 = re.search(r'<div\s+id="txt"[^>]*>(.*?)</div>', bqg, re.S)
txt_inner = m2.group(1) if m2 else '（正文提取失败）'

bqg_html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>第一千二百六十五章 巨角牛（五）_笔趣阁365模板</title>
<link rel="stylesheet" href="data:,">
<style>
body{{margin:0;background:rgb(246,244,236);font-family:SimSun}}
.tiao{{background:#4a6f8f;color:#fff;padding:8px 16px}}
.nav{{background:#e8e4da;padding:6px 16px;font-size:13px}}
#neirong{{font-size:18px;width:940px;margin:20px auto;padding:20px;font-family:宋体;background:rgb(246,244,236)}}
#neirong h1{{font-size:28px;text-align:center}}
#txt{{line-height:50px;margin:40px}}
.gongneng1,.baocuo{{padding:10px;font-size:13px;color:#666}}
#fanye,#fanye1{{padding:14px;text-align:center;background:#efe9dd}}
#fanye a,#fanye1 a{{margin:0 10px;color:#345a7d}}
.zhezhao{{position:fixed;inset:0;background:rgba(0,0,0,.4)}}
.tankuang{{position:fixed;left:50%;top:40%;transform:translateX(-50%);background:#fff;padding:20px;width:300px}}
.like{{padding:10px;color:#999}}
.footer{{text-align:center;color:#aaa;padding:16px}}
</style></head>
<body id="moshi">
<div class="tiao">笔趣阁365 模板 · 顶部通栏</div>
<div class="nav"><a href="#">首页</a> | <a href="#">排行榜</a> | <a href="#">完本</a></div>
<div id="neirong" class="yanse1">
  <h1>第一千二百六十五章 巨角牛（五）</h1>
  <div class="gongneng1"><a href="#">加入书签</a><a href="#">推荐本书</a><a href="#">返回目录</a></div>
  <div id="txt" class="txt">{txt_inner}</div>
  <div class="baocuo"><a href="#">章节报错</a></div>
  <div id="fanye" class="fanye1"><a href="jieqi-demo.html">上一章</a><a href="#">目录</a><a href="spa-demo.html">下一章</a></div>
  <div id="fanye1" class="fanye1"><a href="jieqi-demo.html">上一页</a><a href="spa-demo.html">下一页</a></div>
</div>
<div class="zhezhao" id="zhezhao"></div>
<div class="tankuang" id="tankuang">弹窗广告：注册即送 VIP！<br><button onclick="document.getElementById('zhezhao').style.display='none'">关闭</button></div>
<div class="like">猜你喜欢：《测试作品一》《测试作品二》</div>
<div class="footer">笔趣阁365 测试页脚</div>
<script>setTimeout(function(){{var z=document.getElementById('zhezhao');if(z)z.style.display='none';}},100);</script>
</body></html>"""
open(os.path.join(EXT, 'bqg365-demo.html'), 'w', encoding='utf-8').write(bqg_html)
print('bqg365-demo.html  正文块长度:', len(re.sub(r'<[^>]+>', '', txt_inner)))

# ---------- 3) SPA 型（还原 bqg128 的 #loading 行为） ----------
paras = [
    "夜色像一张慢慢合拢的网，把整座城收了进去。",
    "他站在天台的边缘往下看，车流汇成两条发亮的长河，一条向北，一条向南。",
    "风从楼宇之间的缝隙里穿过来，带着深秋特有的凉意，吹得他睁不开眼。",
    "手机在口袋里震动了两下，他没有接。他知道是谁，也知道对方要说什么。",
    "十天前的那场雨还留在他的记忆里。雨点砸在挡风玻璃上，雨刮器徒劳地摆动，而副驾驶上的人再也没有醒过来。",
    "「你到底想瞒到什么时候？」档案室的灯管闪了闪，老陈把一份卷宗推到他面前。",
    "卷宗的封皮已经泛黄，边角处有一圈深褐色的水渍，像一枚褪色的印章。",
    "他翻开第一页，照片上的人对他笑得很平静，平静得近乎残忍。",
    "「这不是意外。」老陈的声音很低，像是从很远的地方传来。",
    "他合上卷宗，指尖在封皮上停了很久，最后轻轻敲了三下——这是他们当年约定好的信号。",
    "走廊尽头的电梯门开了，走出来一个撑伞的身影，伞面上的水珠一路滴到大堂的大理石上。",
    "他认得那把伞。黑色，长柄，伞骨上有一道几乎看不出来的凹陷。那是三年前，他亲手递出去的东西。",
    "「久等了。」来人收了伞，语气像在谈论天气。",
    "「没有。」他说，「我们还有一整个晚上。」",
    "窗外，最后一班公交碾过积水，灯光在水面上碎成一片晃动的金色。",
]
import html as H
body = '<br/>'.join('　　' + H.escape(p) for p in paras)
spa_html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>夜行_第十二章 天台_单页应用模板</title>
<style>body{{font-family:sans-serif;background:#fff;margin:0}}#loading{{padding:60px;text-align:center;color:#888}}</style>
</head><body>
<div id="loading">正在加载正文…</div>
<script>
setTimeout(function(){{
  document.getElementById('loading').remove();
  var d=document.createElement('div');
  d.innerHTML='<div class="chapter"><h1>第十二章 天台</h1><div id="chaptercontent">{body}</div>'
    +'<div class="nav"><a href="bqg365-demo.html">上一章</a><a href="jieqi-demo.html">下一章</a></div></div>';
  document.body.appendChild(d);
}},1500);
</script>
</body></html>"""
open(os.path.join(EXT, 'spa-demo.html'), 'w', encoding='utf-8').write(spa_html)
print('spa-demo.html OK')
