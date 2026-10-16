// かんじクエスト：機種変更（データの引っ越し）
//
// POST   /api/move {code, data}   古い端末が データを一時的に あずける（30分・1回だけ）
// GET    /api/move?code=...       新しい端末が 受けとる（受けとったら すぐ消える）
// GET    /api/move?code=...&peek=1 まだ残っているか（古い端末が 完了を知るため）
// DELETE /api/move {code}         やめる
//
// 名前やメールアドレスは使わない。コードを知っている人だけが 1回だけ 受けとれる。

function envEnding(suffix) {
  const k = Object.keys(process.env).find(k => k.endsWith(suffix) && process.env[k]);
  return k ? process.env[k] : undefined;
}
const DB_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || envEnding('KV_REST_API_URL') || envEnding('REDIS_REST_URL');
const DB_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || envEnding('KV_REST_API_TOKEN') || envEnding('REDIS_REST_TOKEN');
const TTL = 30 * 60;
const MAX = 3.8 * 1024 * 1024;
const CODE_RE = /^[A-Za-z0-9]{24,40}$/;

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
async function db(cmds) {
  const r = await fetch(DB_URL + '/pipeline', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + DB_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmds),
  });
  if (!r.ok) throw new Error('db ' + r.status);
  return r.json();
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > MAX + 4096) throw new Error('too_big'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

module.exports = async (req, res) => {
  if (!DB_URL || !DB_TOKEN) return send(res, 503, { error: 'no_db' });
  const host = req.headers['x-forwarded-host'] || req.headers.host;

  if (req.method === 'GET') {
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    const code = String(q.code || '');
    if (!code) return send(res, 200, { ok: true });
    if (!CODE_RE.test(code)) return send(res, 400, { error: 'bad_code' });
    if (q.peek) { const [e] = await db([['EXISTS', 'kq:move:' + code]]); return send(res, 200, { waiting: Number(e.result) > 0 }); }
    const [g, d] = await db([['GET', 'kq:move:' + code], ['DEL', 'kq:move:' + code]]);
    if (!g.result) return send(res, 404, { error: 'not_found' });
    return send(res, 200, g.result);
  }

  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== host) return send(res, 403, { error: 'origin' }); } catch { return send(res, 403, { error: 'origin' }); } }
  let b;
  try { b = await readBody(req); } catch (e) { return send(res, e.message === 'too_big' ? 413 : 400, { error: e.message }); }
  const code = String(b.code || '');
  if (!CODE_RE.test(code)) return send(res, 400, { error: 'bad_code' });

  if (req.method === 'POST') {
    const data = typeof b.data === 'string' ? b.data : JSON.stringify(b.data || {});
    if (data.length > MAX) return send(res, 413, { error: 'too_big' });
    const [s] = await db([['SET', 'kq:move:' + code, data, 'NX', 'EX', TTL]]);
    if (s.result !== 'OK') return send(res, 409, { error: 'exists' });
    return send(res, 200, { ok: true, ttl: TTL });
  }
  if (req.method === 'DELETE') { await db([['DEL', 'kq:move:' + code]]); return send(res, 200, { ok: true }); }
  return send(res, 405, { error: 'method' });
};
