#!/usr/bin/env python3
"""かんじクエスト：検索・AI向けの静的ページを作る
index.html の利用規約・プライバシーの本文から terms.html / privacy.html を作り、
about.html（このアプリについて・よくある質問）、robots.txt、sitemap.xml、llms.txt を書き出す。
規約やFAQを変えたら、このスクリプトをもう一度実行する： python3 tools/gen_static.py
"""
import re, json, html, pathlib, datetime
ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = 'https://kanji-quest-black.vercel.app'
TODAY = datetime.date.today().isoformat()
src = (ROOT / 'index.html').read_text()

def section(id_):
    m = re.search(r'<section class="panel doc" id="%s"[^>]*>(.*?)</section>' % id_, src, re.S)
    body = m.group(1)
    # メールは表示時に組み立てる（迷惑メール対策）
    return body

FAQ = [
  ('かんじクエストとは何ですか？', 'AIが採点する、小学生の漢字テストの練習アプリです。文の中の読みがなを見て、スマホやタブレットに指で漢字を書くと、AIがまとめて○×をつけます。合格するとポイントがたまり、おうちで決めたごほうびと交換できます。無料・登録なしで、ブラウザですぐ使えます。'),
  ('AIはどうやって採点しますか？', '書いた字の画像をAIが見て、正しい漢字が書けているかを判定し、×のときは「てんが1つたりないよ」のように、どこがちがうかも教えてくれます。指で書くので、字のきれいさや、とめ・はね・はらいは厳しく見ません。AIが使えないときは、答えを見て自分で○×をつけられます。'),
  ('ごほうびとポイントのしくみは？', 'ごほうびの中身と必要なポイントは、おうちで自由に決めます（例：ゲーム1時間＝50pt、おやつ＝50pt）。一発合格で+50pt、書き直すほど少なくなり、合格のあとの自主練でも+10pt（1日4回まで）。15日連続で+100ptのボーナスもあります。'),
  ('ごほうびで勉強させるのはよくないのでは？', '使い方しだいだと考えています。かんじクエストでは、ごほうびは家庭で話し合って決め、ポイントは「書けるまで練習した」がんばりにつくようにしています。PINを決めると交換には保護者のOKが必要になり、保護者のスマホからもOKや記録の確認ができます。'),
  ('何年生の漢字に対応していますか？', '1年生〜6年生の全1026字に対応しています。光村図書の国語の教科書の順番を目安に、学期ごとの範囲を選べます。ほかの漢字を追加することもできます。'),
  ('1回に何問ですか？', '1回5問・10問・20問から選べます。80点以上で合格です。'),
  ('まちがえた漢字はどうなりますか？', '「書けるまで練習！」で、答えを見て覚えてから、もう一度書きます。全部書けたら合格で、書き直しが少ないほど多くのポイントがもらえます。'),
  ('会員登録や個人情報は必要ですか？', '必要ありません。名前やメールアドレスは集めません。ポイントや記録は、使っている端末の中に保存されます。'),
  ('家族のスマホから記録を見られますか？', 'はい。「管理メニュー」の「家族と共有」でQRコードを出し、保護者のスマホで読みとると、ポイントや記録、ごほうびの交換を見たり、OKしたりできます。'),
  ('機種変更のときは？', '「管理メニュー」の「新しい端末に移す」でQRコードを出し、新しい端末で読みとると、データが移ります。'),
  ('料金はかかりますか？', '無料です。Amazonアソシエイトの広告リンクがあります。'),
  ('iPhoneやiPadで使うには？', 'Safariで開いて「共有」→「ホーム画面に追加」すると、アプリのように使えます。データも消えにくくなります。'),
]

CSS = """:root{--ink:#1C2A5C;--sky:#5EC4FF;--paper:#fff;--line:#D5DEEC;--red:#F0402F;--yellow:#FFCF1F}
*{box-sizing:border-box}body{margin:0;background:var(--sky);color:var(--ink);font:500 15px/1.8 "M PLUS Rounded 1c","Hiragino Maru Gothic ProN",system-ui,sans-serif}
.wrap{max-width:760px;margin:0 auto;padding:24px 16px 48px}
header{text-align:center;padding:12px 0 20px}header img{width:min(420px,100%);height:auto}
header p{margin:6px 0 0;color:#fff;font-weight:800;text-shadow:2px 2px 0 var(--ink)}
.panel{background:var(--paper);border:4px solid var(--ink);border-radius:20px;box-shadow:0 6px 0 var(--ink);padding:18px 20px;margin:0 0 18px}
h1{font-size:22px;line-height:1.5;margin:0 0 8px}h2{font-size:18px;margin:0 0 6px}h3{font-size:16px;margin:14px 0 2px}
p,ul,dl{margin:0 0 8px}ul{padding-left:1.3em}dt{font-weight:800;margin-top:12px}dd{margin:2px 0 0}
a{color:var(--ink);font-weight:800}
.cta{display:block;text-align:center;background:var(--red);color:#fff;text-decoration:none;border-radius:16px;padding:14px;font-size:18px;box-shadow:0 6px 0 #B3241A;margin:8px 0 18px}
nav{text-align:center;font-size:13px}nav a{color:#fff;text-shadow:1px 1px 0 var(--ink);margin:0 8px}
.doc-lead{font-weight:800}.doc-date{font-size:12px;opacity:.7}
small{opacity:.75}"""

def page(title, desc, path, body, ld=None):
    ldtag = '\n'.join('<script type="application/ld+json">%s</script>' % json.dumps(x, ensure_ascii=False) for x in (ld or []))
    return f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<link rel="canonical" href="{SITE}{path}">
<meta property="og:type" content="website"><meta property="og:site_name" content="かんじクエスト">
<meta property="og:title" content="{html.escape(title)}"><meta property="og:description" content="{html.escape(desc)}">
<meta property="og:url" content="{SITE}{path}"><meta property="og:image" content="{SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#5EC4FF">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@500;800&display=swap">
<style>{CSS}</style>
{ldtag}
</head>
<body><div class="wrap">
<header><a href="/"><img src="/logo.png" alt="かんじクエスト" width="1000" height="184"></a><p>小学生の漢字。書けますか？</p></header>
{body}
<nav><a href="/">アプリをひらく</a><a href="/about.html">このアプリについて</a><a href="/terms.html">利用規約</a><a href="/privacy.html">プライバシー</a></nav>
<p style="text-align:center;color:#fff;font-size:11px;text-shadow:1px 1px 0 var(--ink)">© 2026 TIMING</p>
</div>
<script>document.querySelectorAll('a.ml').forEach(a=>{{const m=a.dataset.u+String.fromCharCode(64)+a.dataset.d;a.textContent=m;a.href='mai'+'lto:'+m}});</script>
</body></html>
"""

ORG = {"@type": "Organization", "name": "TIMING", "url": SITE}
APP = {"@context": "https://schema.org", "@type": "WebApplication", "name": "かんじクエスト",
  "alternateName": "Kanji Quest", "url": SITE + "/", "image": SITE + "/og.png",
  "description": "AIが採点する、小学生の漢字テスト練習アプリ。指で書いた漢字をAIが○×で採点し、まちがえた字は書けるまで練習。おうちで決めたごほうびに向けてポイントを貯める。1〜6年生（全1026字）・無料・登録なし。",
  "applicationCategory": "EducationalApplication", "operatingSystem": "iOS, iPadOS, Android, Windows, macOS（Webブラウザ）",
  "inLanguage": "ja", "isAccessibleForFree": True,
  "offers": {"@type": "Offer", "price": "0", "priceCurrency": "JPY"},
  "audience": {"@type": "EducationalAudience", "educationalRole": "student", "audienceType": "小学生と保護者"},
  "educationalLevel": "小学1年生〜6年生",
  "featureList": ["指で書いた漢字をAIが採点（どこがちがうかも教える）", "ごほうびをおうちで決めて、ポイントを貯めて交換", "交換は保護者のOK（PIN・保護者のスマホ）",
                  "まちがえた漢字は書けるまで練習", "1〜6年生の漢字 全1026字・教科書順", "1回5・10・20問", "家族と共有（QRコード）", "会員登録なし・個人情報を集めない"],
  "publisher": ORG, "author": ORG}
FAQLD = {"@context": "https://schema.org", "@type": "FAQPage",
  "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in FAQ]}

about = f"""<section class="panel">
<h1>AIが採点する漢字テスト。ごほうびを決めて、ポイント集めをがんばろう</h1>
<p>かんじクエストは、小学生の漢字テストの練習アプリです。指で書いた漢字を<b>AIが採点</b>。合格するとポイントがたまり、<b>おうちで決めたごほうび</b>と交換できます。まちがえた漢字は「書けるまで練習！」。1〜6年生の全1026字・無料・登録なしで、ブラウザですぐ使えます。</p>
<a class="cta" href="/">アプリをひらく（無料）</a>
<h2>1. AIが採点する</h2>
<ul>
<li>文の中の［よみがな］を見て、大きなマスに指で漢字を書く（1回 5・10・20問）</li>
<li>書いた字をAIが見て○×。×のときは「てんが1つたりないよ」のように、どこがちがうかも教える</li>
<li>指で書くので、字のきれいさや、とめ・はね・はらいは厳しく見ない。最後は自分で○×を直せる</li>
</ul>
<h2>2. ごほうびを決めて、ポイントを貯める</h2>
<ul>
<li>ごほうびの中身と必要なポイントは、おうちで自由に決める（例：ゲーム1時間＝50pt、おやつ＝50pt）</li>
<li>一発合格 +50pt。書き直し1回 +40・2回 +30・3回 +20・4回以上 +10</li>
<li>合格のあとの自主練は、80点以上で +10pt（1日4回まで）。15日連続で +100pt</li>
<li>PINを決めると、ごほうびの交換は保護者のOKが必要に。保護者のスマホからもOKできる</li>
</ul>
<h2>3. 書けるまで練習</h2>
<ul>
<li>まちがえた漢字は、答えを見て覚えてから、見ないでもう一度書く</li>
<li>全部書けたら合格。「きろく」で、前の問題と自分の字を日付ごとに見返せる</li>
<li>光村図書の教科書の順番を目安に、学期ごとの範囲を選べる。ほかの漢字も追加できる</li>
</ul>
<h2>保護者の方へ</h2>
<p>会員登録はなく、名前やメールアドレスも集めません。ポイントや記録は使っている端末の中に保存されます。「家族と共有」を使うと、保護者のスマホから記録やごほうびの交換を確認できます。くわしくは<a href="/privacy.html">プライバシーポリシー</a>をご覧ください。</p>
</section>
<section class="panel">
<h2>よくある質問</h2>
<dl>{''.join(f'<dt>{html.escape(q)}</dt><dd>{html.escape(a)}</dd>' for q, a in FAQ)}</dl>
</section>"""

out = {
 'about.html': page('かんじクエストについて｜AIが採点する漢字テスト。ごほうびを決めてポイント集め',
   'AIが採点する、小学生の漢字テスト練習アプリ。指で書いた漢字をAIが○×。おうちで決めたごほうびに向けてポイントを貯めよう。まちがえた字は書けるまで練習。1〜6年生・無料・登録なし。', '/about.html', about, [APP, FAQLD]),
 'terms.html': page('利用規約｜かんじクエスト', 'かんじクエストの利用規約です。', '/terms.html',
   '<section class="panel"><h1>利用規約</h1>' + section('tmTos') + '</section>'),
 'privacy.html': page('プライバシーポリシー｜かんじクエスト', 'かんじクエストのプライバシーポリシーです。名前やメールアドレスなどの個人情報は集めません。', '/privacy.html',
   '<section class="panel"><h1>プライバシーポリシー</h1>' + section('tmPp') + '</section>'),
}
for k, v in out.items(): (ROOT / k).write_text(v)

(ROOT / 'robots.txt').write_text(f"""# かんじクエスト
User-agent: *
Allow: /
Disallow: /api/

# AIの検索・回答サービスも歓迎します
User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-SearchBot
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /

Sitemap: {SITE}/sitemap.xml
""")
urls = ['/', '/about.html', '/terms.html', '/privacy.html']
(ROOT / 'sitemap.xml').write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  ''.join(f'  <url><loc>{SITE}{u}</loc><lastmod>{TODAY}</lastmod></url>\n' for u in urls) + '</urlset>\n')
(ROOT / 'llms.txt').write_text(f"""# かんじクエスト

> AIが採点する、小学生の漢字テスト練習アプリ。指で書いた漢字をAIが○×で採点し（どこがちがうかも教える）、まちがえた字は書けるまで練習する。おうちで決めたごほうびに向けてポイントを貯め、保護者のOKで交換する。1〜6年生の全1026字・無料・会員登録なし・名前やメールアドレスは集めない。運営：TIMING。

- アプリ: {SITE}/
- このアプリについて・よくある質問: {SITE}/about.html
- 利用規約: {SITE}/terms.html
- プライバシーポリシー: {SITE}/privacy.html

## 特徴
""" + ''.join(f'- {f}\n' for f in APP['featureList']) + """
## よくある質問
""" + ''.join(f'### {q}\n{a}\n\n' for q, a in FAQ))
print('wrote', list(out) + ['robots.txt', 'sitemap.xml', 'llms.txt'])
