/* ===== 教科の連携（かんじクエスト・ひっさんクエストなど 同じサイトの教科アプリ） =====
   この部分は 各アプリに同じものを入れる（tools/wallet-snippet.js が元）。APP・APP_NAME・DEFAULT_SHOP・S・save・todayKey・dkey は 各アプリのもの。
   連携は 自分で選ぶ（どちらか1つだけの人は 今までどおり）。2つの教科を使っている人にだけ「新しい機能」として知らせる。
   連携すると「財布」が1つになる：W = {v,linked,points,total,tickets,shop,shopV,reqs,pin, apps:{kanji:{name,last,days,joined}}, days:{日付:{アプリ:{earned,cleared}, bonus}}}
   連携ルール（A案）：
   - 連携している教科の数 n で、各教科のポイントを割る（2教科×1/2、3教科×1/3）
   - その日にクリアした教科の数 k で、その日の合計に ×(1＋0.5×(k−1))。上乗せ分を「連携ボーナス」として足す
   - ごほうびの値段は変えない
   つながるとき：ポイント・チケット・おねがいは足し合わせる。ごほうびの一覧は 長く使っていた教科のものを使い、もう一方にしかないものを下に足す */
const WKEY='questWallet.v1',LINK_DAYS=14,WF=['points','total','tickets','shop','shopV','reqs','pin'];
const FUNDS=()=>({points:0,total:0,tickets:[],shop:[],shopV:0,reqs:[],pin:''});
function emptyW(){return {v:1,linked:false,...FUNDS(),apps:{},days:{},offerOff:{}}}
function readW(){try{const w=JSON.parse(localStorage.getItem(WKEY));if(w&&w.v===1){const e=emptyW();
  for(const k in e)if(w[k]===undefined)w[k]=e[k];return w}}catch(e){}return null}
const isDefaultShop=sh=>JSON.stringify((sh||[]).map(x=>[x.name,x.cost]))===JSON.stringify(DEFAULT_SHOP.map(x=>[x.name,x.cost]));
let W=readW()||emptyW();
function bindWallet(){WF.forEach(k=>{delete S[k];Object.defineProperty(S,k,{get:()=>W[k],set:v=>{W[k]=v},configurable:true,enumerable:false})})}
// この教科のポイント・チケット・ごほうびを 財布にまぜる
function joinWallet(){
  const mine={points:S.points||0,total:S.total||0,tickets:Array.isArray(S.tickets)?S.tickets:[],shop:Array.isArray(S.shop)?S.shop:DEFAULT_SHOP.map(x=>({...x})),
    shopV:S.shopV||0,reqs:Array.isArray(S.reqs)?S.reqs:[],pin:S.pin||''};
  W.points+=mine.points;W.total+=mine.total;W.tickets=W.tickets.concat(mine.tickets);W.reqs=W.reqs.concat(mine.reqs);
  if(!W.shop.length)W.shop=mine.shop;
  else{const myDays=Object.keys(S.days||{}).length,others=Math.max(0,...Object.entries(W.apps).filter(([id,a])=>id!==APP&&a.joined).map(([,a])=>a.days||0));
    let base=W.shop,add=mine.shop;if((myDays>others||isDefaultShop(W.shop))&&!isDefaultShop(mine.shop)){base=mine.shop;add=W.shop} // 自分で決めた一覧があれば そちらを優先
    if(isDefaultShop(add)&&!isDefaultShop(base))add=[]; // 何も変えていない一覧は まぜない
    const names=new Set(base.map(x=>x.name));W.shop=base.concat(add.filter(x=>!names.has(x.name)))}
  W.shopV=Math.max(W.shopV||0,mine.shopV);if(!W.pin)W.pin=mine.pin;
  S.walletJoined=true;W.apps[APP]={...(W.apps[APP]||{}),name:APP_NAME,joined:true};bindWallet()}
if(W.linked){if(S.walletJoined)bindWallet();else{joinWallet();save()}} // まぜたら すぐ保存（このあと読みなおしても 消えないように）
else if(S.walletJoined&&S.points===undefined){S.walletJoined=false;S.points=0;S.total=0} // 検証中の前の版のデータ
W.apps[APP]={...(W.apps[APP]||{}),name:APP_NAME};
function saveW(){try{localStorage.setItem(WKEY,JSON.stringify(W))}catch(e){}}
function freshW(){const w=readW();if(w)W=w} // ほかのタブで 変わっているかもしれないので 読みなおす
addEventListener('storage',e=>{if(e.key===WKEY){freshW();if(W.linked&&!S.walletJoined){joinWallet();save()}try{if(typeof onWalletChange==='function')onWalletChange()}catch(_){}}});
function touchApp(){W.apps[APP]={...(W.apps[APP]||{}),name:APP_NAME,last:todayKey(),days:Object.keys(S.days||{}).length};save()}
const recent=a=>{const lim=new Date();lim.setDate(lim.getDate()-LINK_DAYS);return (a.last||'')>=dkey(lim)};
// 連携している教科（自分をふくむ）。連携していなければ 自分だけ
function linkedApps(){if(!W.linked)return [{id:APP,name:APP_NAME}];
  return Object.entries(W.apps).filter(([id,a])=>id===APP||(a.joined&&recent(a))).map(([id,a])=>({id,name:a.name||id}))}
const otherApps=()=>Object.entries(W.apps).filter(([id,a])=>id!==APP&&recent(a)).map(([id,a])=>({id,name:a.name||id}));
const linkN=()=>Math.max(1,linkedApps().length);
const linkMul=k=>1+.5*Math.max(0,k-1);
const linkPt=v=>Math.max(1,Math.round(v/linkN()));
function wDay(){const t=todayKey();return W.days[t]||(W.days[t]={bonus:0})}
let linkGot=0;
// ポイントをもらう（連携中は 教科の数で割って 財布へ）
function earn(e){if(!W.linked){S.points+=e;S.total+=e;return e}
  freshW();const v=linkPt(e);const d=wDay();const me=d[APP]||(d[APP]={earned:0,cleared:false});
  me.earned+=v;W.points+=v;W.total+=v;return v}
function markCleared(){if(!W.linked)return;const d=wDay();(d[APP]||(d[APP]={earned:0,cleared:false})).cleared=true}
function settleLink(){linkGot=0;if(!W.linked)return 0;const d=wDay();const apps=Object.keys(d).filter(k=>k!=='bonus'&&d[k]&&typeof d[k]==='object');
  const k=apps.filter(a=>d[a].cleared).length,sum=apps.reduce((s,a)=>s+(d[a].earned||0),0);
  const want=Math.round(sum*(linkMul(k)-1)),add=want-(d.bonus||0);
  if(add>0&&linkN()>1){d.bonus=want;W.points+=add;W.total+=add;linkGot=add}return linkGot}
const wesc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function renderLink(){const box=document.getElementById('linkBox');if(!box)return;
  if(W.linked){const ap=linkedApps(),n=ap.length;if(n<2){box.hidden=true;return}
    const d=W.days[todayKey()]||{},k=ap.filter(a=>d[a.id]&&d[a.id].cleared).length;
    box.hidden=false;box.className='linkbox';
    box.innerHTML=`<div class="link-h">${n}教科 連携中</div>
      <div class="link-row">${ap.map(a=>`<span class="lk ${d[a.id]&&d[a.id].cleared?'done':''}">${wesc(a.name)}${d[a.id]&&d[a.id].cleared?' ✓':''}</span>`).join('')}</div>
      <div class="link-note">${k>=n?`今日は全部クリア！ 連携ボーナス ×${linkMul(k)}`:(k?`あと${n-k}教科クリアで ×${linkMul(n)}${k>1?`（今は ×${linkMul(k)}）`:''}`:`${n===2?'両方':'全部'} クリアで ×${linkMul(n)}`)}</div>`;return}
  box.hidden=true}
function linkModal(html,btns){const m=document.createElement('div');m.className='modal link-intro';
  m.innerHTML=`<div class="panel">${html}<div class="row">${btns.map((b,i)=>`<button class="btn ${b.cls||'green'}" data-i="${i}">${b.t}</button>`).join('')}</div></div>`;
  m.addEventListener('click',e=>{const b=e.target.closest('[data-i]');if(!b)return;m.remove();btns[+b.dataset.i].on&&btns[+b.dataset.i].on()});
  document.body.appendChild(m)}
const LINK_TEXT=n=>`<p style="font-size:15px;font-weight:500;line-height:1.7;text-align:left;margin:0">・ポイントと ごほうび・チケットが 1つになります。<br>・同じ日に ${n===2?'両方':'全部'} クリアすると <b>連携ボーナス ×${linkMul(n)}</b>。</p>
  <div class="link-warn"><b>ご注意</b><br>・ポイントは ${n}つの教科で わけあうので、1つの教科で もらえるポイントは へります。<br>・ごほうびの中身と ひつようなポイントは そのままです。連携したあとに 一度 確認してください。<br>・連携は あとからでも できます。</div>`;
// 新しく できた教科（ほかの教科のホームの上に「リリース」として出す）
const NEW_APPS={hissan:{name:'ひっさんクエスト（筆算）',short:'ひっさん',desc:'計算の筆算を 指で書いて、AIが まるつけ。毎日10問、学年ごとの計算に チャレンジ！'}};
const appName=id=>(W.apps[id]&&W.apps[id].name)||(NEW_APPS[id]&&NEW_APPS[id].short)||((document.querySelector(`.subjects a[data-app="${id}"]`)||{}).textContent||'').trim()||id;
// 上の教科ボタン：連携していない教科は うすい表示。押すと「連携しますか？」
function renderNav(){const nav=document.querySelector('.subjects');if(!nav)return;
  const rel=Object.keys(NEW_APPS).find(id=>id!==APP&&!(W.seenRelease||{})[id]&&!W.linked&&!(W.apps[id]&&W.apps[id].last)&&nav.querySelector(`a[data-app="${id}"]`)); // もう使っている教科は「リリース」と言わない
  let ban=document.getElementById('releaseBan');
  if(rel){ // まだ見ていない新しい教科：ボタンのかわりに リリースのお知らせ
    nav.hidden=true;if(!ban){ban=document.createElement('button');ban.id='releaseBan';ban.className='release';nav.parentNode.insertBefore(ban,nav)}
    ban.hidden=false;ban.innerHTML=`<span class="new">NEW</span>${wesc(NEW_APPS[rel].name)} リリース！`;ban.onclick=()=>openRelease(rel);return}
  if(ban)ban.hidden=true;nav.hidden=false;
  nav.querySelectorAll('a[data-app]').forEach(a=>{const id=a.dataset.app,off=id!==APP&&!W.linked;a.classList.toggle('off',off);
    a.onclick=off?(e=>{e.preventDefault();e.stopPropagation();openLinkOffer(id)}):null})}
function seeRelease(id){W.seenRelease=W.seenRelease||{};W.seenRelease[id]=todayKey();saveW();renderNav()}
function openRelease(id){const r=NEW_APPS[id];
  linkModal(`<p style="font-size:20px;font-weight:800;margin:0">${wesc(r.name)}が できました！</p><p style="font-size:15px;font-weight:500;line-height:1.7;margin:0">${wesc(r.desc)}</p>
    <p style="font-size:15px;font-weight:800;margin:0">${wesc(APP_NAME)}と 連携すると…</p>${LINK_TEXT(2)}`,
    [{t:'あとで',cls:'white',on:()=>seeRelease(id)},{t:'連携して はじめる',on:()=>{seeRelease(id);startLink(id)}}])}
function openLinkOffer(id){
  if(W.linked){linkModal(`<p style="font-size:20px;font-weight:800;margin:0">${linkN()}教科 連携中</p>${LINK_TEXT(Math.max(2,linkN()))}`,[{t:'とじる'}]);return}
  id=id||Object.keys(W.apps).find(k=>k!==APP)||Object.keys(NEW_APPS).find(k=>k!==APP);const nm=appName(id);
  linkModal(`<p style="font-size:20px;font-weight:800;margin:0">${wesc(nm)}と 連携しますか？</p>${LINK_TEXT(2)}
    <p style="font-size:13px;font-weight:500;margin:0;text-align:left">${wesc(APP_NAME)}だけで いい人は、連携しなくても だいじょうぶです。</p>`,
    [{t:'今はしない',cls:'white'},{t:'連携する',on:()=>startLink(id)}])}
function goApp(id){const a=document.querySelector(`.subjects a[data-app="${id}"]`);if(a){a.classList.remove('off');a.onclick=null;a.click()}}
function startLink(id){freshW();if(!W.linked){Object.assign(W,FUNDS());W.linked=true;W.linkAt=todayKey()}
  if(!S.walletJoined)joinWallet();W.apps[APP].introSeen=true;
  if(id)W.apps[id]={...(W.apps[id]||{}),introSeen:true}; // 自分で選んで つないだので、相手の教科でも 説明は出さない
  save();try{if(typeof onWalletChange==='function')onWalletChange()}catch(_){}renderNav();
  const nm=id?appName(id):'';
  linkModal(`<p style="font-size:20px;font-weight:800;margin:0">連携しました！</p><p style="font-size:15px;font-weight:500;margin:0">上の ボタンで、いつでも 教科を 切りかえられます。</p><p style="font-size:14px;font-weight:500;margin:0">ごほうびの中身と ひつようなポイントを、「ごほうび」から 一度 確認してください。</p>`,
    id?[{t:'あとで',cls:'white'},{t:`${wesc(nm)}へ`,on:()=>goApp(id)}]:[{t:'OK'}])}
// あとから つながった教科で 1回だけ 知らせる
function linkIntro(){if(!W.linked||!S.walletJoined||W.apps[APP].introSeen)return;W.apps[APP].introSeen=true;saveW();
  if(linkN()<2)return;
  linkModal(`<p style="font-size:20px;font-weight:800;margin:0">${wesc(linkedApps().map(a=>a.name).join('と'))}が つながりました！</p>${LINK_TEXT(linkN())}`,[{t:'わかった！'}])}
function resetWallet(){if(W.linked){Object.assign(W,FUNDS());W.shop=DEFAULT_SHOP.map(x=>({...x}));S.walletJoined=true;W.apps[APP]={...(W.apps[APP]||{}),joined:true};bindWallet()}
  else S.walletJoined=false;saveW()}
