# かんじクエスト

小学生のための漢字練習アプリ。1〜6年の漢字（学年別漢字配当表・1026字）に対応し、学年と学期（光村図書の順番）でテストの範囲を選べます。毎日10問、指で書いてAIが丸つけします。まちがえた漢字は書けるようになるまで練習し、ポイントをためて、ごほうびと交換できます。

- `index.html`：アプリ本体（ビルド不要の静的ページ）
- `api/kanji.js`：AI丸つけ（Vercel Functions → Claude API）

## Vercel の環境変数

| 名前 | 必須 | 内容 |
|---|---|---|
| `ANTHROPIC_API_KEY` | ○ | Claude の APIキー |
| `KANJI_AI_PER_DAY` | | サイト全体で1日に使えるAI丸つけの回数（省略時 40） |
| `KANJI_MODEL` | | 使うモデル（省略時 claude-sonnet-5-5） |

Upstash Redis をつなぐと、1日の回数制限が働きます（つながっていなければ、Anthropic の月の上限金額だけで止まります）。

## 使いすぎ防止

- アプリ側：AI丸つけは1日15回まで（テスト＋れんしゅう）（`index.html` の `AI_PER_DAY`）
- サーバー側：サイト全体で1日40回まで（`KANJI_AI_PER_DAY`、Redis接続時）
- Anthropic の管理画面で月の上限金額（Spend limit）を設定しておく
