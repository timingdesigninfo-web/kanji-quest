#!/usr/bin/env node
// 文章題の型のチェック：node tools/check-words.js
//  - リニューアルのルール（BANK_VER が2以上なら、学年ごとに2割以上が新しい型）
//  - 単元ごとに3つ以上・言葉から計算を選ぶ型が1つ以上
//  - どの型も 300回作って、文に undefined がない・答えが式と合う・数がおかしくない
//  - 1年の文に漢字がない
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const W = require(path.join(root, 'hissan/words.js'));
const html = fs.readFileSync(path.join(root, 'hissan/index.html'), 'utf8');

// アプリの数字づくり（R〜UNITS）を そのまま使う
const src = html.slice(html.indexOf('const R=(a,b)=>'), html.indexOf('const UNIT=Object.fromEntries'));
const { UNITS, R, addGen, subGen, mulGen, divGen, fracGen } = new Function(src + '\nreturn{UNITS,R,addGen,subGen,mulGen,divGen,fracGen}')();
const UNIT = Object.fromEntries(UNITS.map(u => [u.id, u]));

const errs = [];
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const fr = s => { const m = String(s).match(/^(\d+)\/(\d+)$/); return m ? [+m[1], +m[2]] : [+s, 1]; };
function value(a, op, b) {
  const [an, ad] = fr(a), [bn, bd] = fr(b);
  const v = op === '+' ? [an * bd + bn * ad, ad * bd] : op === '−' ? [an * bd - bn * ad, ad * bd] : op === '×' ? [an * bn, ad * bd] : [an * bd, ad * bn];
  const g = gcd(Math.abs(v[0]), v[1]) || 1; return [v[0] / g, v[1] / g];
}
const ids = new Set();
for (const t of W.TEMPLATES) {
  if (ids.has(t.id)) errs.push(`id がかぶっている: ${t.id}`); ids.add(t.id);
  const u = UNIT[t.u]; if (!u) { errs.push(`${t.id}: 単元 ${t.u} がない`); continue; }
  if (!(t.add >= 1 && t.add <= W.BANK_VER)) errs.push(`${t.id}: add が おかしい`);
  for (let i = 0; i < 300; i++) {
    const used = new Set();
    const r = { R, pick: a => a[R(0, a.length - 1)], gen: id => UNIT[id].gen(), add: addGen, sub: subGen, mul: mulGen, div: divGen, frac: fracGen,
      name() { let n; do n = W.NAMES[R(0, W.NAMES.length - 1)]; while (used.has(n)); used.add(n); return n; } };
    const p = t.make(r);
    const bad = m => { errs.push(`${t.id}: ${m}（${p.text}）`); i = 1e9; };
    if (!p.text || /undefined|NaN|null/.test(p.text)) { bad('文が こわれている'); continue; }
    if (u.g === 1 && /[一-鿿]/.test(p.text)) { bad('1年の文に 漢字がある'); continue; }
    if (!String(p.text).includes(String(p.a)) || !String(p.text).includes(String(p.b))) { bad('式の数が 文に出ていない'); continue; }
    const v = value(p.a, p.op, p.b);
    if (typeof p.ans === 'object') { if (v[0] * p.ans.d !== p.ans.n * v[1]) bad('分数の答えが 式と合わない'); }
    else if (p.op === '÷') { const [an] = fr(p.a), [bn] = fr(p.b); if (Math.floor(an / bn) !== p.ans || (an % bn) !== (p.rem || 0)) bad('わり算の答えが合わない'); }
    else if (v[1] !== 1 || v[0] !== p.ans) bad('答えが 式と合わない');
    if (v[0] <= 0) bad('答えが 0 以下');
    if (p.final != null && !(p.final > 0)) bad('final が おかしい');
  }
}
// 単元ごと
for (const u of UNITS) {
  const ts = W.TEMPLATES.filter(t => t.u === u.id);
  if (ts.length < 3) errs.push(`単元 ${u.id}（${u.name}）の型が ${ts.length}こ（3つ以上 いる）`);
  const r = { R, pick: a => a[0], gen: id => UNIT[id].gen(), add: addGen, sub: subGen, mul: mulGen, div: divGen, frac: fracGen, name: () => 'ひろと' };
  const base = u.gen().op, ops = new Set(ts.map(t => t.make(r).op));
  const hasFinal = ts.some(t => t.make(r).final != null);
  if (![...ops].some(o => o !== base) && !hasFinal) warn(`単元 ${u.id}: 言葉から計算を選ぶ型（ちがう計算・あまりを考える）がない`);
}
// リニューアルのルール
for (let g = 1; g <= 6; g++) {
  const ts = W.TEMPLATES.filter(t => UNIT[t.u] && UNIT[t.u].g === g);
  const fresh = ts.filter(t => t.add === W.BANK_VER).length;
  const share = ts.length ? fresh / ts.length : 0;
  const line = `${g}年：型 ${ts.length}こ、この版(${W.BANK_VER})で新しい型 ${fresh}こ（${Math.round(share * 100)}%）`;
  if (W.BANK_VER > 1 && share < 0.2) errs.push(line + ' → 2割以上 新しくする');
  else console.log(line);
}
function warn(m) { warn.list = warn.list || []; warn.list.push(m); }
(warn.list || []).forEach(m => console.log('注意: ' + m));
if (errs.length) { console.error(errs.map(e => '✗ ' + e).join('\n')); process.exit(1); }
console.log(`OK：文章題の型 ${W.TEMPLATES.length}こ`);
