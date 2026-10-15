// かんじクエスト：家族と共有（記録を ほかの端末から見られるようにする）
//
// 名前やメールアドレスは使わない。ランダムな ID と、書きこみ用のカギだけ。
// POST   /api/sync {id, key, data}  記録を保存（最初に使ったカギの持ち主だけが上書きできる）
// GET    /api/sync?id=...           記録を見る（読みとり専用）
// DELETE /api/sync {id, key}        共有をやめる（記録を消す）
//
// データベース：Upstash Redis（Vercel の Storage からつなぐ）。180日 更新がなければ自動で消える。

const crypto = require('crypto');
function envEnding(suffix) {
  const k = Object.keys(process.env).find(k => k.endsWith(suffix) && process.env[k]);
  return k ? process.env[k] : undefined;
}
const DB_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || envEnding('KV_REST_API_URL') || envEnding('REDIS_REST_URL');
const DB_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || envEnding('KV_REST_API_TOKEN') || envEnding('REDIS_REST_TOKEN');
const TTL = 180 * 24 * 3600;
const MAX = 900 * 1024;
const ID_RE = /^[A-Za-z0-9]{16,32}$/, KEY_RE = /^[A-Za-z0-9]{32,64}$/;

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
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
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
    const id = String((req.query && req.query.id) || new URL(req.url, 'http://x').searchParams.get('id') || '');
    if (!id) return send(res, 200, { ok: true, db: true });
    if (!ID_RE.test(id)) return send(res, 400, { error: 'bad_id' });
    const [d] = await db([['GET', 'kq:data:' + id]]);
    if (!d.result) return send(res, 404, { error: 'not_found' });
    return send(res, 200, d.result);
  }

  // 書きこみは このサイトからだけ
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== host) return send(res, 403, { error: 'origin' }); } catch { return send(res, 403, { error: 'origin' }); } }

  let b;
  try { b = await readBody(req); } catch (e) { return send(res, e.message === 'too_big' ? 413 : 400, { error: e.message === 'too_big' ? 'too_big' : 'bad_json' }); }
  const id = String(b.id || ''), key = String(b.key || '');
  if (!ID_RE.test(id) || !KEY_RE.test(key)) return send(res, 400, { error: 'bad_id' });
  const owner = sha(key);

  if (req.method === 'POST') {
    const data = JSON.stringify(b.data || {});
    if (data.length > MAX) return send(res, 413, { error: 'too_big' });
    const [set, cur] = await db([['SET', 'kq:own:' + id, owner, 'NX', 'EX', TTL], ['GET', 'kq:own:' + id]]);
    if (cur.result !== owner) return send(res, 403, { error: 'not_owner' });
    await db([['SET', 'kq:data:' + id, data, 'EX', TTL], ['EXPIRE', 'kq:own:' + id, TTL]]);
    return send(res, 200, { ok: true });
  }
  if (req.method === 'DELETE') {
    const [cur] = await db([['GET', 'kq:own:' + id]]);
    if (cur.result && cur.result !== owner) return send(res, 403, { error: 'not_owner' });
    await db([['DEL', 'kq:data:' + id, 'kq:own:' + id]]);
    return send(res, 200, { ok: true });
  }
  return send(res, 405, { error: 'method' });
};
