// ひっさんクエスト：AIの読み取りAPI（Vercel Functions）※アルファ版。かんじクエストの本番画面からは使っていない
//
// POST /api/hissan  {careful:false, items:[{desc:"画像1: 47 + 38（たし算）／読むもの: ...", image:"data:image/png;base64,..."}]}
//   → {results:[{n:1, answer:"85", remainder:"", carries:"1", clear:true, note:"..."}]}
//   AIは「書いてあるとおりに読む」だけ。正しいかどうかは アプリ側のプログラムが判定する。
//   careful=false は速くて安いモデル、true は読めなかった問題の読み直し用（ていねいなモデル）。
// GET  /api/hissan  動作確認
//
// 環境変数：ANTHROPIC_API_KEY（必須。かんじクエストと共通）
//           HISSAN_MODEL（任意。省略時 claude-haiku-5-5）／HISSAN_MODEL_CAREFUL（任意。省略時 claude-sonnet-5-5）
//           HISSAN_AI_PER_DAY（任意。サイト全体で1日に使える回数。省略時 60）

const DAILY = Number(process.env.HISSAN_AI_PER_DAY || 60);
function envEnding(suffix) {
  const k = Object.keys(process.env).find(k => k.endsWith(suffix) && process.env[k]);
  return k ? process.env[k] : undefined;
}
const DB_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || envEnding('KV_REST_API_URL') || envEnding('REDIS_REST_URL');
const DB_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || envEnding('KV_REST_API_TOKEN') || envEnding('REDIS_REST_TOKEN');
const jstDay = (t = Date.now()) => new Date(t + 9 * 3600e3).toISOString().slice(0, 10);

const RULES = `画像の説明:
- 灰色の活字（数字・記号・実線）は はじめから印刷された問題。うすい点線のたて線は 位（くらい）の区切り、点線のわくは答えを書く場所。読むのは紺色の手書きだけ。
- うすい黄色の段（左に「くり上がり」「くり下がり」と書いてある）は、メモを書く場所。たし算では線のすぐ下（答えの上）、ひき算では問題の上にある。
- 答えは「大きく書いた数字」だけ。どこに書いてあっても、小さい数字・数字の右上や左上の小さな1・点やチョンという線は くり上がりのメモなので、answer に入れず carries に入れる。
- 印刷された数字を ななめ線で消して小さく書きなおしたものは、くり下がりのメモ。
- 問題は右上にあります。左や下の線のない広い所は 自由に書けるメモ用なので、答えとして読みません。

1まいごとに読み取るもの:
- answer: 答え（数字だけ。分数は 7/12 のように / を使う）
- remainder: あまり（わり算でなければ、または書いていなければ空文字）
- carries: くり上がり・くり下がりのメモ（左から順に。なければ空文字）
- clear: 数字がはっきり読めたら true、自信がない所があれば false
- note: 書き方について 子どもに向けた ひらがな多めの ひとこと（25文字いない）

ルール:
- 正しい答えを計算してはいけません。書いてあるとおりに読んでください。まちがった数が書いてあれば、そのまま読みます。
- 読めない数字は ? にします。
- 指で書いているので、線のふるえや字の大きさは気にしません。

JSONの配列だけで答えてください。画像1つにつき1つ、順番どおり:
[{"n":1,"answer":"85","remainder":"","carries":"1","clear":true,"note":"くらいが そろっていて 見やすいよ"}]`;

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
async function overDailyLimit() {
  if (!DB_URL || !DB_TOKEN) return false;
  try {
    const key = 'hissan:ai:' + jstDay();
    const r = await fetch(DB_URL + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + DB_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, 172800]]),
    });
    if (!r.ok) return false;
    const [count] = await r.json();
    return Number(count.result) > DAILY;
  } catch { return false; }
}

module.exports = async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (req.method === 'GET') return send(res, 200, { ok: true, key_set: !!key, daily_limit: DAILY, counter: !!(DB_URL && DB_TOKEN) });
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'origin' }); }
    catch { return send(res, 403, { error: 'origin' }); }
  }
  if (!key) return send(res, 503, { error: 'AIの準備中です（APIキー未設定）。' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const items = Array.isArray(body && body.items) ? body.items.slice(0, 10) : [];
  if (!items.length) return send(res, 200, { results: [] });
  const content = [], lines = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const desc = String(it.desc || '').replace(/[\r\n]+/g, ' ').slice(0, 220);
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(it.image || ''));
    if (!m || m[1].length > 1500000) return send(res, 400, { error: 'bad_item', index: i });
    lines.push(desc || `画像${i + 1}`);
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: m[1] } });
  }
  content.push({ type: 'text', text: `小学生がタブレットに指で書いた算数の答えの画像が ${items.length}まい あります。順番は下のリストと同じです。1まいずつ読み取ってください。\n\n${lines.join('\n')}\n\n${RULES}` });

  if (await overDailyLimit()) return send(res, 429, { error: 'きょうのAIの読み取りは おしまい' });
  const model = body.careful ? (process.env.HISSAN_MODEL_CAREFUL || 'claude-sonnet-5-5') : (process.env.HISSAN_MODEL || 'claude-haiku-5-5');
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 3000, messages: [{ role: 'user', content }] }),
    });
    if (!r.ok) { console.error('anthropic', r.status, (await r.text()).slice(0, 300)); return send(res, 502, { error: 'anthropic_error', status: r.status }); }
    const data = await r.json();
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    let results = null;
    const a = text.indexOf('['), b = text.lastIndexOf(']');
    if (a >= 0 && b > a) { try { results = JSON.parse(text.slice(a, b + 1)); } catch {} }
    if (!Array.isArray(results)) { results = []; for (const mm of text.matchAll(/\{[^{}]*\}/g)) { try { results.push(JSON.parse(mm[0])); } catch {} } }
    if (!results.length) { console.error('parse_failed', text.slice(0, 300)); return send(res, 502, { error: 'parse_failed' }); }
    const s = (v, n) => String(v == null ? '' : v).slice(0, n);
    return send(res, 200, { model, results: results.map(x => ({ n: Number(x && x.n) || 0, answer: s(x && x.answer, 20), remainder: s(x && x.remainder, 10), carries: s(x && x.carries, 20), clear: !(x && x.clear === false), note: s(x && x.note, 60) })) });
  } catch (e) { console.error(e); return send(res, 502, { error: 'failed' }); }
};
