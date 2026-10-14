# かんじクエスト

小学生のための漢字練習アプリ。毎日10問、指で書いてAIが丸つけします。ポイントをためて、ごほうびと交換できます。

- `index.html`：アプリ本体（ビルド不要の静的ページ）
- `api/kanji.js`：AI丸つけ（Vercel Functions → Claude API）

## Vercel の環境変数

| 名前 | 必須 | 内容 |
|---|---|---|
| `ANTHROPIC_API_KEY` | ○ | Claude の APIキー |
| `KANJI_AI_PER_DAY` | | サイト全体で1日に使えるAI丸つけの回数（省略時 20） |
| `KANJI_MODEL` | | 使うモデル（省略時 claude-sonnet-5-5） |

Upstash Redis をつなぐと、1日の回数制限が働きます（つながっていなければ、Anthropic の月の上限金額だけで止まります）。

## 使いすぎ防止

- アプリ側：AI丸つけは1人1日5回まで（`index.html` の `AI_PER_DAY`）
- サーバー側：サイト全体で1日20回まで（`KANJI_AI_PER_DAY`、Redis接続時）
- Anthropic の管理画面で月の上限金額（Spend limit）を設定しておく
