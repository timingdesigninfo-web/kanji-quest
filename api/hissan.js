// ひっさんクエスト：AIの読み取りAPI（Vercel Functions）※アルファ版。かんじクエストの本番画面からは使っていない
//
// POST /api/hissan  {careful:false, items:[{desc:"画像1: 47 + 38（たし算）／読むもの: ...", image:"data:image/png;base64,..."}]}
//   → {results:[{n:1, shiki:"", answer:"85", remainder:"", carries:"1", clear:true, note:"..."}]}
//   AIは「書いてあるとおりに読む」だけ。正しいかどうかは アプリ側のプログラムが判定する。
//   careful=false は速くて安いモデル、true は読めなかった問題の読み直し用（ていねいなモデル）。
// GET  /api/hissan  動作確認
// GET  /api/hissan?diag=1  今日の成功・失敗の数と、最近のエラー（画像は残さない）
// POST {act:'report',...}  「読めなかった理由を製作者に送る」（下の saveReport）
// GET  /api/hissan?reports=<合言葉>  送られた報告を見る（環境変数 HISSAN_ADMIN_KEY）
//
// 環境変数：ANTHROPIC_API_KEY（必須。かんじクエストと共通）
//           HISSAN_MODEL（任意。省略時 claude-haiku-5-5）／HISSAN_MODEL_CAREFUL（任意。省略時 claude-sonnet-5-5）
//           HISSAN_AI_PER_DAY（任意。サイト全体で1日に使える回数＝10問のまとまりの数。省略時 100）

const DAILY = Number(process.env.HISSAN_AI_PER_DAY || 100);
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
- 文章題は、上に活字の文、その下に「しき」と「こたえ」のわくがあります。わくの右の活字（単位）は問題の一部。

1まいごとに読み取るもの:
- shiki: 文章題の「しき」のわくに書いた式（× ÷ + − 、分数は / 。文章題でなければ空文字）
- answer: 答え（数字だけ。分数は 7/12 のように / を使う）
- remainder: あまり（わり算でなければ、または書いていなければ空文字）
- carries: くり上がり・くり下がりのメモ（左から順に。なければ空文字）
- clear: 数字がはっきり読めたら true、自信がない所があれば false
- note: 書き方について 子どもに向けた ひらがな多めの ひとこと（25文字いない。「商」「位取り」などの むずかしい言葉は使わず、「わり算の答え」「くらい」のような ふだんの言葉で）

ルール:
- 正しい答えを計算してはいけません。書いてあるとおりに読んでください。まちがった数が書いてあれば、そのまま読みます。
- 読めない数字は ? にします。
- 指で書いているので、線のふるえや字の大きさは気にしません。

JSONの配列だけで答えてください。画像1つにつき1つ、順番どおり:
[{"n":1,"shiki":"","answer":"85","remainder":"","carries":"1","clear":true,"note":"くらいが そろっていて 見やすいよ"}]`;

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
async function overDailyLimit(n) { // n問ぶん数える（10問で1回。分けて送っても回数は同じ）
  if (!DB_URL || !DB_TOKEN) return false;
  try {
    const key = 'hissan:ai:' + jstDay();
    const r = await fetch(DB_URL + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + DB_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCRBY', key + ':q', n], ['EXPIRE', key + ':q', 172800]]),
    });
    if (!r.ok) return false;
    const [count] = await r.json();
    return Number(count.result) > DAILY * 10;
  } catch { return false; }
}

// うまくいかなかった時の記録（画像や答えは残さない）。GET /api/hissan?diag=1 で、今日の数と 最近20件を見られる
async function note(kind, info) {
  if (!DB_URL || !DB_TOKEN) return;
  try {
    const day = 'hissan:diag:' + jstDay(), cmds = [['HINCRBY', day, kind, 1], ['EXPIRE', day, 8 * 86400]];
    if (info) cmds.push(['LPUSH', 'hissan:diag:err', JSON.stringify({ t: new Date(Date.now() + 9 * 3600e3).toISOString().slice(5, 19), kind, ...info })], ['LTRIM', 'hissan:diag:err', 0, 49]);
    await fetch(DB_URL + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + DB_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  } catch {}
}
async function diag(res) {
  if (!DB_URL || !DB_TOKEN) return send(res, 200, { counter: false });
  try {
    const r = await fetch(DB_URL + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + DB_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify([['HGETALL', 'hissan:diag:' + jstDay()], ['LRANGE', 'hissan:diag:err', 0, 19], ['GET', 'hissan:ai:' + jstDay() + ':q']]) });
    const [h, l, q] = (await r.json()).map(x => x.result);
    const today = {}; for (let i = 0; h && i < h.length; i += 2) today[h[i]] = Number(h[i + 1]);
    return send(res, 200, { day: jstDay(), today, questions_today: Number(q) || 0, limit_questions: DAILY * 10, recent: (l || []).map(x => { try { return JSON.parse(x); } catch { return x; } }) });
  } catch (e) { return send(res, 200, { error: String(e).slice(0, 100) }); }
}

// ---- 「読めなかった理由を製作者に送る」（押した人だけ。画像つき。30日で消える） ----
// POST {act:'report', state, err, grade, units, ua, items:[{img:"data:image/jpeg;base64,...", q, ans, read}]}
// GET  /api/hissan?reports=<HISSAN_ADMIN_KEY>  製作者が見るページ（合言葉を知っている人だけ）
const RP_TTL = 30 * 86400, RP_PER_DAY = 300;
async function db(cmds) {
  const r = await fetch(DB_URL + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + DB_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(cmds) });
  if (!r.ok) throw new Error('db ' + r.status);
  return (await r.json()).map(x => x.result);
}
async function saveReport(res, body) {
  if (!DB_URL || !DB_TOKEN) return send(res, 503, { error: 'no_db' });
  const items = (Array.isArray(body.items) ? body.items : []).slice(0, 10);
  const clean = [];
  for (const it of items) {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String((it && it.img) || ''));
    if (!m || m[1].length > 300000) continue;
    const rd = it.read && typeof it.read === 'object' ? it.read : null;
    clean.push({ img: m[1], q: String(it.q || '').slice(0, 80), ans: String(it.ans || '').slice(0, 60),
      read: rd ? { shiki: String(rd.shiki || '').slice(0, 40), answer: String(rd.answer || '').slice(0, 20), remainder: String(rd.remainder || '').slice(0, 10), clear: rd.clear !== false } : null });
  }
  if (!clean.length) return send(res, 400, { error: 'empty' });
  const day = 'hissan:rp:n:' + jstDay();
  const [n] = await db([['INCR', day], ['EXPIRE', day, 172800]]);
  if (Number(n) > RP_PER_DAY) return send(res, 429, { error: 'too_many' });
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const meta = { id, t: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19).replace('T', ' '), state: String(body.state || '').slice(0, 12), err: String(body.err || '').slice(0, 60),
    grade: Number(body.grade) || 0, units: (Array.isArray(body.units) ? body.units : []).slice(0, 10).map(x => String(x).slice(0, 12)), ua: String(body.ua || '').slice(0, 120), n: clean.length };
  await db([['SET', 'hissan:rp:' + id, JSON.stringify({ ...meta, items: clean }), 'EX', RP_TTL], ['LPUSH', 'hissan:rp:list', id], ['LTRIM', 'hissan:rp:list', 0, 499]]);
  return send(res, 200, { ok: true });
}
async function showReports(res, k) {
  const admin = process.env.HISSAN_ADMIN_KEY;
  if (!admin || k !== admin) return send(res, 403, { error: admin ? 'key' : 'HISSAN_ADMIN_KEY が未設定です' });
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ids = (await db([['LRANGE', 'hissan:rp:list', 0, 59]]))[0] || [];
  const got = ids.length ? await db(ids.map(id => ['GET', 'hissan:rp:' + id])) : [];
  const cards = got.filter(Boolean).map(x => { let d; try { d = JSON.parse(x); } catch { return ''; }
    return `<section><h3>${esc(d.t)}　${esc(d.state)} ${esc(d.err)}　${d.grade}年 ${esc((d.units || []).join(' '))}</h3><p class="ua">${esc(d.ua)}</p>` +
      d.items.map(it => `<div class="it"><img src="data:image/jpeg;base64,${it.img}"><div><b>${esc(it.q)}</b><br>正しい答え：${esc(it.ans)}<br>AIの読み：${it.read ? esc(`しき「${it.read.shiki}」 こたえ「${it.read.answer}」${it.read.remainder ? ' あまり「' + it.read.remainder + '」' : ''}${it.read.clear ? '' : '（自信なし）'}`) : '（読めず）'}</div></div>`).join('') + '</section>'; }).join('');
  res.statusCode = 200; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex');
  return res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="robots" content="noindex"><title>ひっさん 読めなかった報告</title>
<style>body{font:14px/1.6 sans-serif;margin:16px;color:#1C2A5C}section{border:2px solid #1C2A5C;border-radius:12px;padding:10px;margin:0 0 14px}h3{margin:0;font-size:15px}.ua{font-size:11px;opacity:.6;margin:2px 0 8px}.it{display:flex;gap:10px;align-items:flex-start;margin:6px 0;border-top:1px dashed #ccd}.it img{max-width:60%;border:1px solid #ccd;background:#fff}</style>
<h1>読めなかった報告（新しい順・30日で消える）</h1>${cards || '<p>まだありません</p>'}`);
}

module.exports = async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (req.method === 'GET' && /[?&]diag=1/.test(req.url || '')) return diag(res);
  { const m = /[?&]reports=([^&]+)/.exec(req.url || ''); if (req.method === 'GET' && m) { try { return await showReports(res, decodeURIComponent(m[1])); } catch (e) { return send(res, 500, { error: String(e).slice(0, 100) }); } } }
  if (req.method === 'GET') return send(res, 200, { ok: true, key_set: !!key, daily_limit: DAILY, counter: !!(DB_URL && DB_TOKEN) });
  if (req.method !== 'POST') return send(res, 405, { error: 'method' });
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) { await note('origin', { origin: String(origin).slice(0, 60), host: String(req.headers.host).slice(0, 60) }); return send(res, 403, { error: 'origin' }); } }
    catch { return send(res, 403, { error: 'origin' }); }
  }
  if (!key) return send(res, 503, { error: 'AIの準備中です（APIキー未設定）。' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  if (body && body.act === 'report') { try { return await saveReport(res, body); } catch (e) { console.error(e); return send(res, 500, { error: 'save' }); } }
  const items = Array.isArray(body && body.items) ? body.items.slice(0, 10) : [];
  if (!items.length) return send(res, 200, { results: [] });
  const content = [], lines = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const desc = String(it.desc || '').replace(/[\r\n]+/g, ' ').slice(0, 260);
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(it.image || ''));
    if (!m || m[1].length > 1500000) { await note('bad_item', { i, len: m ? m[1].length : -1, head: String(it.image || '').slice(0, 30) }); return send(res, 400, { error: 'bad_item', index: i }); }
    lines.push(desc || `画像${i + 1}`);
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: m[1] } });
  }
  content.push({ type: 'text', text: `小学生がタブレットに指で書いた算数の答えの画像が ${items.length}まい あります。順番は下のリストと同じです。1まいずつ読み取ってください。\n\n${lines.join('\n')}\n\n${RULES}` });

  if (await overDailyLimit(items.length)) { await note('limit'); return send(res, 429, { error: 'きょうのAIの読み取りは おしまい' }); }
  const model = body.careful ? (process.env.HISSAN_MODEL_CAREFUL || 'claude-sonnet-5-5') : (process.env.HISSAN_MODEL || 'claude-haiku-5-5');
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: 'user', content }] }),
    });
    if (!r.ok) { const et = (await r.text()).slice(0, 300); console.error('anthropic', r.status, et); await note('anthropic_' + r.status, { model, n: items.length, detail: et.slice(0, 200) }); return send(res, 502, { error: 'anthropic_error', status: r.status }); }
    const data = await r.json();
    if (data.stop_reason === 'max_tokens') { console.warn('truncated', model, items.length); await note('truncated', { model, n: items.length }); }
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    let results = null;
    const a = text.indexOf('['), b = text.lastIndexOf(']');
    if (a >= 0 && b > a) { try { results = JSON.parse(text.slice(a, b + 1)); } catch {} }
    if (!Array.isArray(results)) { results = []; for (const mm of text.matchAll(/\{[^{}]*\}/g)) { try { results.push(JSON.parse(mm[0])); } catch {} } }
    if (!results.length) { console.error('parse_failed', text.slice(0, 300)); await note('parse_failed', { model, n: items.length, text: text.slice(0, 200) }); return send(res, 502, { error: 'parse_failed' }); }
    const s = (v, n) => String(v == null ? '' : v).slice(0, n);
    const unclear = results.filter(x => !x || x.clear === false || /\?/.test(String(x.answer || '')) || !String(x.answer || '').trim()).length;
    await note(body.careful ? 'ok_careful' : 'ok_quick'); if (unclear) await note(body.careful ? 'unclear_careful' : 'unclear_quick', { model, n: items.length, unclear, answers: results.map(x => s(x && x.answer, 8) + (x && x.shiki ? '|' + s(x.shiki, 12) : '')).join(',').slice(0, 160) });
    return send(res, 200, { model, results: results.map(x => ({ n: Number(x && x.n) || 0, shiki: s(x && x.shiki, 40), answer: s(x && x.answer, 20), remainder: s(x && x.remainder, 10), carries: s(x && x.carries, 20), clear: !(x && x.clear === false), note: s(x && x.note, 60) })) });
  } catch (e) { console.error(e); await note('exception', { model, detail: String(e).slice(0, 200) }); return send(res, 502, { error: 'failed' }); }
};
