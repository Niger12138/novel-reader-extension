# -*- coding: utf-8 -*-
"""E2E 测试：真实 Chromium + 扩展加载（v1.1 新手向）"""
import os, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.abspath(__file__))
EXT = os.path.abspath(os.path.join(ROOT, '..'))
SHOTS = os.path.abspath(os.path.join(ROOT, '..', '..', 'shots'))
os.makedirs(SHOTS, exist_ok=True)
os.environ['PLAYWRIGHT_CHROMIUM_USE_HEADLESS_NEW'] = '1'
BASE = 'http://localhost:8765/test/'

results = []

def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(('PASS ' if ok else 'FAIL ') + name + ('  | ' + str(detail) if detail else ''))

def shadow(page, expr):
    """在阅读界面的 shadow root 里求值"""
    return page.evaluate(
        "() => { const h = document.querySelector('#wbn-reader-host');"
        " if (!h || !h.shadowRoot) return null; const r = h.shadowRoot; return (" + expr + "); }")

with sync_playwright() as p:
    import shutil
    profile = os.path.join(SHOTS, 'pw-profile')
    shutil.rmtree(profile, ignore_errors=True)  # 全新 profile，避免旧设置串场
    ctx = p.chromium.launch_persistent_context(
        profile,
        headless=False,
        args=[
            f'--disable-extensions-except={EXT}',
            f'--load-extension={EXT}',
            '--window-size=1280,900',
        ],
        viewport={'width': 1280, 'height': 900},
    )
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))

    # ---------- 1) 杰奇模板：深链自动打开 + 首次引导卡 ----------
    page.goto(BASE + 'jieqi-demo.html?wbn=1', wait_until='load')
    page.wait_for_selector('#wbn-reader-host', timeout=8000)
    check('杰奇模板 · 阅读界面自动打开', True)
    page.wait_for_function(
        "() => { const h=document.querySelector('#wbn-reader-host');"
        " return h && h.shadowRoot && !h.shadowRoot.querySelector('.wb-welcome').hidden; }",
        timeout=6000)

    w = shadow(page, "(() => { const w = r.querySelector('.wb-welcome');"
                     " return { shown: !!w && !w.hidden,"
                     " keys: r.querySelectorAll('.wb-keys li').length,"
                     " checked: !!r.querySelector('.wb-auto-site').checked,"
                     " cta: (r.querySelector('.wb-go')||{}).textContent || '' }; })()")
    check('首次进入弹出引导卡', w['shown'])
    check('引导卡写清 4 条操作', w['keys'] == 4, w['keys'])
    check('默认勾选「以后自动进入」', w['checked'] is True)
    check('引导卡主按钮为「开始阅读」', w['cta'].strip() == '开始阅读', w['cta'])
    page.screenshot(path=os.path.join(SHOTS, 'n1_welcome.png'))

    page.evaluate("() => document.querySelector('#wbn-reader-host').shadowRoot.querySelector('.wb-go').click()")
    time.sleep(0.5)
    gone_welcome = shadow(page, "r.querySelector('.wb-welcome').hidden")
    check('点「开始阅读」关闭引导', gone_welcome is True)

    auto_list = []
    try:
        sw = (ctx.service_workers or ctx.background_pages)[0]
        auto_list = sw.evaluate("async () => (await chrome.storage.local.get('wbn-auto-sites'))['wbn-auto-sites'] || []")
    except Exception as e:
        auto_list = ['ERR:' + str(e)]
    check('勾选后写入「本站自动进入」', 'localhost' in auto_list, auto_list)

    # ---------- 2) 正文质量 ----------
    inner = shadow(page, "(() => { const bodyText = r.querySelector('.wb-body').textContent || '';"
                         " return { title: r.querySelector('.wb-h1').textContent || '',"
                         " paras: r.querySelectorAll('.wb-body p').length,"
                         " hasNoise: /首发域名|chaptererror|app2/.test(bodyText),"
                         " theme: r.querySelector('.wb-root').dataset.theme }; })()")
    check('杰奇模板 · 章节标题识别', '雪山之行' in inner['title'], inner['title'])
    check('杰奇模板 · 段落数量 >= 8', inner['paras'] >= 8, inner['paras'])
    check('杰奇模板 · 噪音已清除(script/域名广告)', not inner['hasNoise'])
    check('杰奇模板 · 默认主题 sunset', inner['theme'] == 'sunset', inner['theme'])
    page.screenshot(path=os.path.join(SHOTS, 'n2_reader_sunset.png'))

    # ---------- 3) 设置面板：白话标签 + 大按钮字号 ----------
    labels = shadow(page, "Array.from(r.querySelectorAll('.wb-group > label')).map(x => x.textContent)")
    check('设置项改白话（每行字数 / 行间距）',
          any('每行字数' in l for l in labels) and any('行间距' in l for l in labels), labels)
    labels_all = ' '.join(labels)
    check('已无「版心」「行距」等术语', ('版心' not in labels_all) and ('行距 ' not in labels_all))

    page.evaluate("() => document.querySelector('#wbn-reader-host').shadowRoot.querySelector('[data-act=\"fs-inc\"]').click()")
    time.sleep(0.4)
    fs = shadow(page, "r.querySelector('.wb-root').style.getPropertyValue('--wb-fs')")
    check('A＋ 按钮放大字号（20 → 22）', fs == '22px', fs)

    # 主题切换
    page.evaluate("() => document.querySelector('#wbn-reader-host').shadowRoot.querySelector('.wb-swatch[data-theme=\"night\"]').click()")
    time.sleep(0.4)
    theme2 = shadow(page, "r.querySelector('.wb-root').dataset.theme")
    check('主题切换 → 夜读墨', theme2 == 'night', theme2)
    page.screenshot(path=os.path.join(SHOTS, 'n3_night_theme.png'))

    # 新增主题逐一验证（v1.2 共加了 9 个）
    for tid, name in [('sakura', '樱花粉'), ('latte', '咖啡奶'), ('violet', '薰衣紫'), ('sea', '深海蓝'), ('obsidian', '曜石黑'),
                      ('dusk', '晚霞'), ('starry', '星空'), ('celadon', '青瓷'), ('peach', '蜜桃')]:
        page.evaluate(f"() => document.querySelector('#wbn-reader-host').shadowRoot.querySelector('.wb-swatch[data-theme=\"{tid}\"]').click()")
        time.sleep(0.35)
        got = shadow(page, "r.querySelector('.wb-root').dataset.theme")
        check(f'新增主题切换 → {name}', got == tid, got)
    page.screenshot(path=os.path.join(SHOTS, 'n3b_new_themes.png'))

    # 主题色块应有 13 个
    sw_count = shadow(page, "r.querySelectorAll('.wb-swatch').length")
    check('设置面板提供 13 个主题色块', sw_count == 13, sw_count)

    # 回到暖阳纸，确认设置面板色块布局不溢出
    page.evaluate("() => document.querySelector('#wbn-reader-host').shadowRoot.querySelector('.wb-swatch[data-theme=\"sunset\"]').click()")
    time.sleep(0.35)

    # ---------- 3b) 回归：杰奇 fixture 的导航已是真实站点顺序（下一页 在 下一章 前面） ----------
    order_ok = page.evaluate("""() => {
        const links = [...document.querySelectorAll('.page_chapter a')].map(a => a.textContent.trim());
        return links.indexOf('下一页') !== -1 && links.indexOf('下一页') < links.indexOf('下一章');
    }""")
    check('fixture 已按真实站点顺序排列（下一页在前）', order_ok)

    # ---------- 4) 无刷新翻章（核心新手体验 + 分页导航回归） ----------
    page.evaluate("() => { window.__wbnMarker = 'alive'; }")
    page.evaluate("() => document.querySelector('#wbn-reader-host').shadowRoot.querySelector('.wb-bar [data-act=\"next\"]').click()")
    page.wait_for_function("() => location.href.indexOf('bqg365-demo.html') !== -1", timeout=9000)
    page.wait_for_function(
        "() => { const h=document.querySelector('#wbn-reader-host');"
        " return h && h.shadowRoot && (h.shadowRoot.querySelector('.wb-h1').textContent||'').indexOf('巨角牛') !== -1; }",
        timeout=9000)
    marker = page.evaluate("() => window.__wbnMarker")
    after = shadow(page, "(() => ({ title: r.querySelector('.wb-h1').textContent,"
                         " paras: r.querySelectorAll('.wb-body p').length,"
                         " loadingHidden: r.querySelector('.wb-loading').hidden }))()")
    check('点「下一章」不整页刷新', marker == 'alive', marker)
    check('换章后地址栏同步为下一章', 'bqg365-demo.html' in page.url, page.url)
    check('回归 · 翻章目标不是本文分页（无 #p2）', '#p2' not in page.url, page.url)
    check('换章后标题/正文已更新', '巨角牛' in after['title'] and after['paras'] >= 10,
          f"{after['title']} / {after['paras']}段")
    check('换章时加载提示已收起', after['loadingHidden'] is True)
    page.screenshot(path=os.path.join(SHOTS, 'n4_after_switch.png'))

    # ---------- 5) Esc 退出：回到原站 + 新手气泡 ----------
    page.keyboard.press('Escape')
    try:
        page.wait_for_selector('#wbn-entry', timeout=9000)
    except Exception:
        pass
    closed = page.evaluate("() => !document.querySelector('#wbn-reader-host')")
    check('Esc 退出阅读界面', closed)
    check('退出后地址与页面已对齐（不是旧章节）', 'bqg365-demo.html' in page.url, page.url)
    has_tip = page.evaluate("() => !!document.querySelector('#wbn-tip')")
    entry_txt = page.evaluate("() => (document.querySelector('#wbn-entry')||{}).innerText || ''")
    check('入口按钮文案为白话「阅读模式」', '阅读模式' in entry_txt, entry_txt.replace('\n', ' / '))
    check('首次出现带气泡提示', has_tip)
    page.screenshot(path=os.path.join(SHOTS, 'n5_entry_button.png'))

    # ---------- 6) 再次进入：不再重复引导 ----------
    page.click('#wbn-entry')
    page.wait_for_function(
        "() => { const h=document.querySelector('#wbn-reader-host');"
        " return h && h.shadowRoot && h.shadowRoot.querySelector('.wb-body p'); }",
        timeout=8000)
    time.sleep(0.4)
    welcome_again = shadow(page, "!!r.querySelector('.wb-welcome') && !r.querySelector('.wb-welcome').hidden")
    check('第二次进入不再弹引导', welcome_again is False)
    page.evaluate("() => document.querySelector('#wbn-reader-host').shadowRoot.querySelector('.wb-bar [data-act=\"close\"]').click()")
    time.sleep(0.6)

    # ---------- 7) SPA 模板：等待延迟注入正文 ----------
    page.goto(BASE + 'spa-demo.html?wbn=1', wait_until='load')
    try:
        page.wait_for_selector('#wbn-reader-host', timeout=9000)
        ok7 = True
    except Exception:
        ok7 = False
    check('SPA模板 · 延迟注入后自动打开', ok7)
    if ok7:
        time.sleep(0.5)
        inner7 = shadow(page, "(() => ({ title: r.querySelector('.wb-h1').textContent || '',"
                              " paras: r.querySelectorAll('.wb-body p').length }))()")
        check('SPA模板 · 正文识别', '天台' in inner7['title'] and inner7['paras'] >= 10,
              f"{inner7['title']} / {inner7['paras']}段")
    page.screenshot(path=os.path.join(SHOTS, 'n6_spa_reader.png'))

    # ---------- 8) 安装说明页 ----------
    page.goto('http://localhost:8765/install-guide.html', wait_until='load')
    guide = page.evaluate("() => ({ steps: document.querySelectorAll('.num').length,"
                          " copies: document.querySelectorAll('[data-copy]').length })")
    check('安装说明页可用（4 步 + 一键复制）', guide['steps'] == 4 and guide['copies'] == 2, guide)
    page.screenshot(path=os.path.join(SHOTS, 'n7_install_guide.png'), full_page=True)

    # ---------- 9) 基础健康检查 ----------
    sw_ok = len(ctx.service_workers) > 0 or len(ctx.background_pages) > 0
    check('Service Worker 加载', sw_ok)

    bad = [e for e in errors if 'app2 is not defined' not in e and 'chaptererror is not defined' not in e]
    check('页面无 JS 报错', len(bad) == 0, f'总数{len(errors)} 未过滤{len(bad)}: ' + ' || '.join(repr(x)[:120] for x in bad[:5]))
    ctx.close()

print('\n========== 汇总 ==========')
npass = sum(1 for _, ok, _ in results if ok)
for name, ok, detail in results:
    print(('✓ ' if ok else '✗ ') + name + (('  [' + str(detail) + ']') if detail and not ok else ''))
print(f'{npass}/{len(results)} 通过')
sys.exit(0 if npass == len(results) else 1)
