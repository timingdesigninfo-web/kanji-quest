/* ===== 共通の財布（かんじクエスト・ひっさんクエストなど 同じサイトの教科アプリで共通） =====
   この部分は 各アプリに同じものを入れる（tools/wallet-snippet.js が元）。APP・APP_NAME・DEFAULT_SHOP・S・save・todayKey・dkey は 各アプリのもの。
   W = {v,points,total,tickets,shop,shopV,reqs,pin, apps:{kanji:{name,last,days}}, days:{日付:{アプリ:{earned,cleared}, bonus}}}
   連携ルール（A案）：
   - 最近14日に使った教科の数 n で、各教科のポイントを割る（2教科×1/2、3教科×1/3）
   - その日にクリアした教科の数 k で、その日の合計に ×(1＋0.5×(k−1))。上乗せ分を「連携ボーナス」として足す
   - ごほうびの値段は変えない
   はじめてつながるとき：ポイント・チケット・おねがいは足し合わせる。ごほうびの一覧は 長く使っていた教科のものを使い、もう一方にしかないものを下に足す */
const WKEY='questWallet.v1',LINK_DAYS=14,WF=['points','total','tickets','shop','shopV','reqs','pin'];
function emptyW(){return {v:1,points:0,total:0,tickets:[],shop:DEFAULT_SHOP.map(x=>({...x})),shopV:0,reqs:[],pin:'',apps:{},days:{}}}
function readW(){try{const w=JSON.parse(localStorage.getItem(WKEY));if(w&&w.v===1){const e=emptyW();w.apps=w.apps||{};w.days=w.days||{};
  WF.forEach(k=>{if(w[k]===undefined)w[k]=e[k]});return w}}catch(e){}return null}
const isDefaultShop=sh=>JSON.stringify((sh||[]).map(x=>[x.name,x.cost]))===JSON.stringify(DEFAULT_SHOP.map(x=>[x.name,x.cost]));
let W=readW();
if(!S.walletJoined){
  const mine={points:S.points||0,total:S.total||0,tickets:Array.isArray(S.tickets)?S.tickets:[],shop:Array.isArray(S.shop)?S.shop:DEFAULT_SHOP.map(x=>({...x})),
    shopV:S.shopV||0,reqs:Array.isArray(S.reqs)?S.reqs:[],pin:S.pin||''};
  if(!W){W=emptyW();Object.assign(W,mine)}
  else{
    W.points+=mine.points;W.total+=mine.total;W.tickets=W.tickets.concat(mine.tickets);W.reqs=W.reqs.concat(mine.reqs);
    const myDays=Object.keys(S.days||{}).length,others=Math.max(0,...Object.values(W.apps).map(a=>a.days||0));
    let base=W.shop,add=mine.shop;if(myDays>others&&!isDefaultShop(mine.shop)){base=mine.shop;add=W.shop}
    if(isDefaultShop(add)&&!isDefaultShop(base))add=[]; // 何も変えていない一覧は まぜない
    const names=new Set(base.map(x=>x.name));W.shop=base.concat(add.filter(x=>!names.has(x.name)));
    W.shopV=Math.max(W.shopV||0,mine.shopV);if(!W.pin)W.pin=mine.pin}
  S.walletJoined=true;
}
W.apps[APP]={...(W.apps[APP]||{}),name:APP_NAME};
function bindWallet(){WF.forEach(k=>{delete S[k];Object.defineProperty(S,k,{get:()=>W[k],set:v=>{W[k]=v},configurable:true,enumerable:false})})}
bindWallet();
function saveW(){try{localStorage.setItem(WKEY,JSON.stringify(W))}catch(e){}}
function freshW(){const w=readW();if(w)W=w} // ほかのタブで 変わっているかもしれないので 読みなおす
addEventListener('storage',e=>{if(e.key===WKEY){freshW();try{if(typeof onWalletChange==='function')onWalletChange()}catch(_){}}});
function touchApp(){W.apps[APP]={...(W.apps[APP]||{}),name:APP_NAME,last:todayKey(),days:Object.keys(S.days||{}).length};save()}
function linkedApps(){const lim=new Date();lim.setDate(lim.getDate()-LINK_DAYS);const k=dkey(lim);
  return Object.entries(W.apps).filter(([id,a])=>id===APP||(a.last||'')>=k).map(([id,a])=>({id,name:a.name||id}))}
const linkN=()=>Math.max(1,linkedApps().length);
const linkMul=k=>1+.5*Math.max(0,k-1);
const linkPt=v=>Math.max(1,Math.round(v/linkN()));
function wDay(){const t=todayKey();return W.days[t]||(W.days[t]={bonus:0})}
let linkGot=0;
function earn(e){freshW();const v=linkPt(e);const d=wDay();const me=d[APP]||(d[APP]={earned:0,cleared:false});
  me.earned+=v;W.points+=v;W.total+=v;return v}
function markCleared(){const d=wDay();(d[APP]||(d[APP]={earned:0,cleared:false})).cleared=true}
function settleLink(){linkGot=0;const d=wDay();const apps=Object.keys(d).filter(k=>k!=='bonus'&&d[k]&&typeof d[k]==='object');
  const k=apps.filter(a=>d[a].cleared).length,sum=apps.reduce((s,a)=>s+(d[a].earned||0),0);
  const want=Math.round(sum*(linkMul(k)-1)),add=want-(d.bonus||0);
  if(add>0&&linkN()>1){d.bonus=want;W.points+=add;W.total+=add;linkGot=add}return linkGot}
function renderLink(){const box=document.getElementById('linkBox');if(!box)return;const ap=linkedApps(),n=ap.length;
  if(n<2){box.hidden=true;return}
  const d=W.days[todayKey()]||{},k=ap.filter(a=>d[a.id]&&d[a.id].cleared).length;
  const e=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  box.hidden=false;
  box.innerHTML=`<div class="link-h">${n}教科 連携中<span>ポイントは1教科あたり ×1/${n}</span></div>
    <div class="link-row">${ap.map(a=>`<span class="lk ${d[a.id]&&d[a.id].cleared?'done':''}">${e(a.name)}${d[a.id]&&d[a.id].cleared?' ✓':''}</span>`).join('')}</div>
    <div class="link-note">${k>=n?`今日は全部クリア！ 連携ボーナス ×${linkMul(k)}`:`あと${n-k}教科クリアで ×${linkMul(n)}${k>1?`（今は ×${linkMul(k)}）`:''}`}</div>`}
function resetWallet(){W=emptyW();W.apps[APP]={name:APP_NAME};bindWallet();saveW()}
