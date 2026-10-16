// かんじクエスト：シェア用のリンクカード（XやLINEに 結果の画像をカードで出す）
//
// POST /api/card {img:"data:image/jpeg;base64,...", text}  画像をあずけて、専用URLを返す（30日で自動削除）
// GET  /r/<id>        → XやLINEが読むカード情報（人はアプリのトップへ移動）
// GET  /c/<id>.jpg    → カードの画像
//
// 名前やメールアドレスは使わない。画像は ランダムなIDで しか見られない。

const crypto = require('crypto');
function envEnding(suffix) {
  const k = Object.keys(process.env).find(k => k.endsWith(suffix) && process.env[k]);
  return k ? process.env[k] : undefined;
}
const DB_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || envEnding('KV_REST_API_URL') || envEnding('REDIS_REST_URL');
const DB_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || envEnding('KV_REST_API_TOKEN') || envEnding('REDIS_REST_TOKEN');
const SITE = 'https://kanji-quest-black.vercel.app';
const TTL = 30 * 86400;
const ID_RE = /^[a-z0-9]{12}$/;
const key = id => 'kq:card:' + id;

async function db(cmds) {
  const r = await fetch(DB_URL + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + DB_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('db ' + r.status);
  return (await r.json()).map(x => { if (x.error) throw new Error(x.error); return x.result; });
}
function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

async function rateLimited(req) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  const k = 'kq:rl:card:' + sha(ip).slice(0, 16) + ':' + Math.floor(Date.now() / 60000);
  const [n] = await db([['INCR', k], ['EXPIRE', k, 120]]);
  return n > 12;
}

async function image(res, id) {
  const [img] = ID_RE.test(id) ? await db([['HGET', key(id), 'img']]) : [null];
  if (!img) { res.statusCode = 302; res.setHeader('Location', SITE + '/og.png'); return res.end(); }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  return res.end(Buffer.from(img, 'base64'));
}

async function page(res, id) {
  const ok = ID_RE.test(id);
  const [text] = ok ? await db([['HGET', key(id), 'text']]) : [null];
  const img = text != null ? `${SITE}/c/${id}.jpg` : `${SITE}/og.png`;
  const title = 'かんじクエスト｜小学生の漢字。書けますか？';
  const desc = text || '毎日の漢字テストを、指で書いてAIが採点。ポイントを貯めてごほうびと交換！';
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.end(`<!doctype html><html lang="ja"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:site_name" content="かんじクエスト">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${SITE}/r/${ok ? id : ''}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${img}">
<meta name="robots" content="noindex">
<link rel="canonical" href="${SITE}/">
<meta http-equiv="refresh" content="0;url=/">
</head><body><script>location.replace('/')</script><a href="/">かんじクエストをひらく</a></body></html>`);
}

module.exports = async (req, res) => {
  if (!DB_URL || !DB_TOKEN) return send(res, 503, { error: 'no_db' });
  try {
    const u = new URL(req.url, 'http://x'), q = u.searchParams, rq = req.query || {};
    const cardId = rq.c || q.get('c') || (u.pathname.match(/\/c\/([a-z0-9]+)\.jpg$/) || [])[1];
    const pageId = rq.r || q.get('r') || (u.pathname.match(/\/r\/([a-z0-9]+)\/?$/) || [])[1];
    if (req.method === 'GET' && cardId) return image(res, cardId);
    if (req.method === 'GET' && pageId) return page(res, pageId);
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const origin = req.headers.origin, host = req.headers['x-forwarded-host'] || req.headers.host;
    if (origin) { try { if (new URL(origin).host !== host) return send(res, 403, { error: 'origin' }); } catch { return send(res, 403, { error: 'origin' }); } }
    if (await rateLimited(req)) return send(res, 429, { error: 'rate' });
    let body = req.body;
    if (body === undefined) { const ch = []; let n = 0; for await (const c of req) { n += c.length; if (n > 800000) return send(res, 413, { error: 'too_big' }); ch.push(c); } body = Buffer.concat(ch).toString('utf8'); }
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    body = body || {};
    const img = String(body.img || '').replace(/^data:image\/jpeg;base64,/, '');
    if (!img.startsWith('/9j/') || img.length > 700000) return send(res, 400, { error: 'bad_image' });
    const text = String(body.text || '').slice(0, 160);
    const id = crypto.randomBytes(12).toString('base64').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().padEnd(12, '0').slice(0, 12);
    await db([['HSET', key(id), 'img', img, 'text', text], ['EXPIRE', key(id), TTL]]);
    return send(res, 200, { id, url: `${SITE}/r/${id}` });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'server' });
  }
};
