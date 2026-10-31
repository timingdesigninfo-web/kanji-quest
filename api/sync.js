// かんじクエスト・ひっさんクエスト：家族と共有（記録を ほかの端末から見られるようにする）
//
// 名前やメールアドレスは使わない。ランダムな ID と、書きこみ用のカギだけ。
// POST   /api/sync {id, key, data}  記録を保存（最初に使ったカギの持ち主だけが上書きできる）
// POST   /api/sync {id, key, part:"hissan", data}  ひっさんクエストの記録（同じ共有の中に 教科ごとに保存し、見るときに合わせる）
// GET    /api/sync?id=...           記録を見る（読みとり専用）
// DELETE /api/sync {id, key}        共有をやめる（記録を消す）
// ごほうびの交換を おうちの人がOKする：
// POST   /api/sync {act:"claim", id, admin}           最初に読みこんだ端末が「管理する人」になる
// POST   /api/sync {act:"decide", id, admin, req, ok}  おねがいに OK / ダメ をつける
// POST   /api/sync {act:"shop", id, admin, shop:[...]} ごほうびの中身を 管理する人が決める
// GET    /api/sync?id=...&dec=1                       管理する人がいるか・OK/ダメの一覧・ごほうび
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
const IMG_DAYS = 30, IMG_TTL = IMG_DAYS * 86400; // ひっさんの答えの画像を残す日数
const ID_RE = /^[A-Za-z0-9]{16,32}$/, KEY_RE = /^[A-Za-z0-9]{32,64}$/, REQ_RE = /^[A-Za-z0-9]{6,20}$/;

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
  if (!r.ok) throw new Error('db ' + r.status + ' ' + (await r.text().catch(() => '')).slice(0, 200));
  const out = await r.json();
  // 1つでもエラーがあれば「記録がない」とまちがえないよう 止める（上限こえなど）
  const bad = Array.isArray(out) && out.find(x => x && x.error);
  if (bad) throw new Error('db ' + String(bad.error).slice(0, 200));
  return out;
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex');
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > MAX + 4096) throw new Error('too_big'); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

module.exports = async (req, res) => {
  try { return await handle(req, res); }
  catch (e) { console.error(e); return send(res, 503, { error: 'db', detail: String(e.message || e).slice(0, 200) }); }
};
async function handle(req, res) {
  if (!DB_URL || !DB_TOKEN) return send(res, 503, { error: 'no_db' });
  const host = req.headers['x-forwarded-host'] || req.headers.host;

  if (req.method === 'GET') {
    const id = String((req.query && req.query.id) || new URL(req.url, 'http://x').searchParams.get('id') || '');
    if (!id) return send(res, 200, { ok: true, db: true });
    if (!ID_RE.test(id)) return send(res, 400, { error: 'bad_id' });
    const q = req.query || {};
    // ひっさんの答えの画像（1回ぶん）。?id=&img=記録の時刻
    if (q.img) {
      const t = String(q.img);
      if (!/^\d{10,14}$/.test(t)) return send(res, 400, { error: 'bad_img' });
      const [r] = await db([['GET', 'kq:img:' + id + ':' + t]]);
      return send(res, 200, r.result || '{"imgs":[]}');
    }
    if (q.dec) {
      const [a, h, sh, fx, gf] = await db([['EXISTS', 'kq:adm:' + id], ['HGETALL', 'kq:dec:' + id], ['GET', 'kq:shop:' + id], ['HGETALL', 'kq:fix:' + id], ['HGETALL', 'kq:gift:' + id]]);
      const dec = {}; const arr = h.result || [];
      for (let i = 0; i + 1 < arr.length; i += 2) dec[arr[i]] = arr[i + 1];
      const fix = {}; const fa = fx.result || []; // 管理する人の「なおし」（○ を × に）
      for (let i = 0; i + 1 < fa.length; i += 2) fix[fa[i]] = fa[i + 1];
      let shop = null; try { shop = sh.result ? JSON.parse(sh.result) : null; } catch {}
      const gift = {}; const ga = gf.result || []; // 管理する人からの ポイントのプレゼント
      for (let i = 0; i + 1 < ga.length; i += 2) gift[ga[i]] = ga[i + 1];
      return send(res, 200, { admin: Number(a.result) > 0, dec, shop, fix, gift });
    }
    const [d, hs] = await db([['GET', 'kq:data:' + id], ['GET', 'kq:data:' + id + ':hissan']]);
    if (!d.result && !hs.result) return send(res, 404, { error: 'not_found' });
    if (!hs.result) return send(res, 200, d.result);
    let main = {}, h = {};
    try { main = d.result ? JSON.parse(d.result) : {}; } catch {}
    try { h = JSON.parse(hs.result); } catch {}
    // かんじの記録がまだない（ひっさんだけ）ときは、ひっさんの名前・ポイントなどを使う
    if (!d.result) main = { v: 1, at: h.at, name: h.name, grade: h.grade, points: h.points, reqs: h.reqs, tickets: h.tickets, shop: h.shop, shopV: h.shopV, streak: 0, goal: h.goal, days: {}, log: [], noKanji: true };
    // ポイント・ごほうび・おねがいは 2教科で共通の財布。新しく送られたほうを使う
    else if (!h.sep && (h.at || 0) > (main.at || 0)) { // sep＝連携を切って ポイントが別々
      for (const k of ['points', 'reqs', 'tickets', 'goal']) if (h[k] !== undefined) main[k] = h[k];
      if ((h.shopV || 0) >= (main.shopV || 0) && h.shop) { main.shop = h.shop; main.shopV = h.shopV; }
    }
    main.hissan = h;
    return send(res, 200, main);
  }

  // 書きこみは このサイトからだけ
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== host) return send(res, 403, { error: 'origin' }); } catch { return send(res, 403, { error: 'origin' }); } }

  let b;
  try { b = await readBody(req); } catch (e) { return send(res, e.message === 'too_big' ? 413 : 400, { error: e.message === 'too_big' ? 'too_big' : 'bad_json' }); }
  const id = String(b.id || ''), key = String(b.key || '');
  if (!ID_RE.test(id)) return send(res, 400, { error: 'bad_id' });

  if (req.method === 'POST' && (b.act === 'claim' || b.act === 'decide' || b.act === 'shop' || b.act === 'fix' || b.act === 'gift')) {
    const admin = String(b.admin || '');
    if (!KEY_RE.test(admin)) return send(res, 400, { error: 'bad_admin' });
    const [ex] = await db([['EXISTS', 'kq:data:' + id, 'kq:data:' + id + ':hissan']]);
    if (!Number(ex.result)) return send(res, 404, { error: 'not_found' });
    const mine = sha(admin);
    if (b.act === 'claim') {
      const [, cur] = await db([['SET', 'kq:adm:' + id, mine, 'NX', 'EX', TTL], ['GET', 'kq:adm:' + id]]);
      return send(res, 200, { ok: cur.result === mine });
    }
    const [cur] = await db([['GET', 'kq:adm:' + id]]);
    if (cur.result !== mine) return send(res, 403, { error: 'not_admin' });
    if (b.act === 'shop') {
      const list = (Array.isArray(b.shop) ? b.shop : []).slice(0, 20).map(x => ({
        id: String(x.id || '').slice(0, 24), icon: String(x.icon || 'star').slice(0, 12),
        name: String(x.name || '').slice(0, 20), desc: String(x.desc || '').slice(0, 30),
        cost: Math.max(1, Math.min(99999, Math.round(Number(x.cost) || 1))),
        amz: String(x.amz || '').slice(0, 30),
      })).filter(x => x.name.trim());
      const v = Date.now();
      await db([['SET', 'kq:shop:' + id, JSON.stringify({ v, list }), 'EX', TTL]]);
      return send(res, 200, { ok: true, v });
    }
    if (b.act === 'gift') {
      // ポイントのプレゼント（お手伝い・特別な日など）。子どもの端末が受けとって 財布に足す
      const g = b.gift || {};
      const gid = String(g.gid || ''), pt = Math.round(Number(g.pt)), app = g.app === 'hissan' ? 'hissan' : 'kanji';
      const msg = String(g.msg || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
      if (!REQ_RE.test(gid) || !(pt >= 1 && pt <= 1000)) return send(res, 400, { error: 'bad_gift' });
      await db([['HSET', 'kq:gift:' + id, gid, JSON.stringify({ pt, msg, app, at: Date.now() })], ['EXPIRE', 'kq:gift:' + id, TTL]]);
      return send(res, 200, { ok: true });
    }
    if (b.act === 'fix') {
      // なおし：管理する人が「この ○ は まちがい」と決めた問題。子どもの端末が読んで ×にし、なおしの練習に出す
      const f = b.fix || {};
      const fid = String(f.fid || ''), app = f.app === 'hissan' ? 'hissan' : f.app === 'kanji' ? 'kanji' : '';
      const t = Number(f.t), i = Number(f.i);
      if (!REQ_RE.test(fid) || !app || !Number.isInteger(t) || t <= 0 || !Number.isInteger(i) || i < 0 || i > 30) return send(res, 400, { error: 'bad_fix' });
      await db([['HSET', 'kq:fix:' + id, fid, JSON.stringify({ app, t, i, deduct: !!f.deduct, at: Date.now() })], ['EXPIRE', 'kq:fix:' + id, TTL]]);
      return send(res, 200, { ok: true });
    }
    const r = String(b.req || '');
    if (!REQ_RE.test(r)) return send(res, 400, { error: 'bad_req' });
    await db([['HSET', 'kq:dec:' + id, r, b.ok ? '1' : '0'], ['EXPIRE', 'kq:dec:' + id, TTL], ['EXPIRE', 'kq:adm:' + id, TTL]]);
    return send(res, 200, { ok: true });
  }

  if (!KEY_RE.test(key)) return send(res, 400, { error: 'bad_id' });
  const owner = sha(key);

  if (req.method === 'POST') {
    const data = JSON.stringify(b.data || {});
    if (data.length > MAX) return send(res, 413, { error: 'too_big' });
    const [set, cur] = await db([['SET', 'kq:own:' + id, owner, 'NX', 'EX', TTL], ['GET', 'kq:own:' + id]]);
    if (cur.result !== owner) return send(res, 403, { error: 'not_owner' });
    if (b.part === 'img') {
      // 答えの画像は 1回ぶんずつ 別に保存して、IMG_DAYS 日で消える（毎回の同期では送らない）
      const t = String(b.t || ''), imgs = Array.isArray(b.imgs) ? b.imgs.slice(0, 10) : [];
      if (!/^\d{10,14}$/.test(t)) return send(res, 400, { error: 'bad_img' });
      const ok = imgs.map(x => typeof x === 'string' && x.length < 150000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(x) ? x : null);
      const ik = 'kq:img:' + id + ':' + t;
      await db([['SET', ik, JSON.stringify({ imgs: ok }), 'EX', IMG_TTL], ['SADD', 'kq:imgs:' + id, t], ['EXPIRE', 'kq:imgs:' + id, TTL]]);
      return send(res, 200, { ok: true });
    }
    const dk = 'kq:data:' + id + (b.part === 'hissan' ? ':hissan' : '');
    // ほかのキーの期限（180日）の延長は ときどきでよい（データベースの回数を へらす）
    const more = Math.random() < 0.05 ? [['EXPIRE', 'kq:data:' + id, TTL], ['EXPIRE', 'kq:data:' + id + ':hissan', TTL], ['EXPIRE', 'kq:own:' + id, TTL], ['EXPIRE', 'kq:adm:' + id, TTL], ['EXPIRE', 'kq:dec:' + id, TTL], ['EXPIRE', 'kq:shop:' + id, TTL]] : [];
    await db([['SET', dk, data, 'EX', TTL], ...more]);
    return send(res, 200, { ok: true });
  }
  if (req.method === 'DELETE') {
    const [cur] = await db([['GET', 'kq:own:' + id]]);
    if (cur.result && cur.result !== owner) return send(res, 403, { error: 'not_owner' });
    const [im] = await db([['SMEMBERS', 'kq:imgs:' + id]]);
    const ik = (im.result || []).filter(t => /^\d{10,14}$/.test(t)).map(t => 'kq:img:' + id + ':' + t);
    await db([['DEL', 'kq:imgs:' + id, ...ik, 'kq:data:' + id, 'kq:data:' + id + ':hissan', 'kq:own:' + id, 'kq:adm:' + id, 'kq:dec:' + id, 'kq:shop:' + id, 'kq:fix:' + id, 'kq:gift:' + id]]);
    return send(res, 200, { ok: true });
  }
  return send(res, 405, { error: 'method' });
}
