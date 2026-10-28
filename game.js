'use strict';
const $=id=>document.getElementById(id), cfg=window.GAME_CONFIG;
const W=430,H=540,R=[19,25,32,40,49,60,72,84,97,109,119,128,136], LINE=118;
const canvas=$('game'),ctx=canvas.getContext('2d');
canvas.width=W;canvas.height=H;
const images=R.map((_,i)=>{const im=new Image(); im.src=`assets/images/${String(i+1).padStart(2,'0')}.jpg`;return im;});
let stored={};try{stored=JSON.parse(localStorage.getItem('merge-player')||'{}');}catch{}
let name=stored.name||'',best=stored.best||0,bestBefore=best,score=0,balls=[],particles=[],next=0,current=0,aim=W/2;
let achieved=false, celebrationActive=false, celebrationToken=0;
let running=false,started=false,cooldown=0,danger=0,rankBefore=null,celebrated=false,round=0,elapsed=0;
const save=()=>{try{localStorage.setItem('merge-player',JSON.stringify({name,best}));}catch{toast('浏览器存储不可用，记录可能无法保留');}};
const toast=t=>{$('toast').textContent=t;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',4000);};
const rand=()=>Math.floor(Math.random()*4);
const audio={context:null,music:null,musicGain:null,sfxGain:null,buffers:[],musicSource:null,loading:null,celebrationBuffer:null,celebrationSource:null};
function audioInit(){
 if(!audio.context){
  audio.context=new (window.AudioContext||window.webkitAudioContext)();
  audio.musicGain=audio.context.createGain();audio.musicGain.gain.value=Number($('musicVolume').value);audio.musicGain.connect(audio.context.destination);
  audio.sfxGain=audio.context.createGain();audio.sfxGain.gain.value=Number($('sfxVolume').value);audio.sfxGain.connect(audio.context.destination);
 }
 audio.context.resume().catch(()=>{});
 if(!audio.loading){
  const decode=async path=>{const r=await fetch(path);if(!r.ok)throw Error('音频加载失败');return audio.context.decodeAudioData(await r.arrayBuffer());};
  audio.loading=Promise.allSettled([
   decode('assets/audio/bgm.mp3').then(buffer=>{audio.music=buffer;const s=audio.context.createBufferSource();s.buffer=buffer;s.loop=true;s.connect(audio.musicGain);s.start();audio.musicSource=s;}),
   decode('assets/audio/celebration.mp3').then(b=>{audio.celebrationBuffer=b;if(celebrationActive)startCelebrationAudio();}),
   ...Array.from({length:14},(_,i)=>decode(`assets/audio/merge-${String(i+1).padStart(2,'0')}.mp3`).then(b=>audio.buffers.push(b)))
  ]).then(r=>{if(r.some(x=>x.status==='rejected'))toast('部分声音未加载，刷新页面可重试');});
 }
}
function startCelebrationAudio(){
 if(!celebrationActive||!audio.celebrationBuffer||audio.celebrationSource)return;
 const source=audio.context.createBufferSource();source.buffer=audio.celebrationBuffer;source.loop=true;source.connect(audio.sfxGain);source.start();audio.celebrationSource=source;
}
function stopCelebration(){
 celebrationActive=false;celebrationToken++;
 if(audio.celebrationSource){audio.celebrationSource.stop();audio.celebrationSource.disconnect();audio.celebrationSource=null;}
 $('confetti').style.display='none';
}
function playMerge(){if(!audio.buffers.length)return;const s=audio.context.createBufferSource();s.buffer=audio.buffers[Math.floor(Math.random()*audio.buffers.length)];s.connect(audio.sfxGain);s.onended=()=>s.disconnect();s.start();}
$('musicVolume').value=cfg.musicVolume;$('sfxVolume').value=cfg.sfxVolume;
$('musicVolume').oninput=e=>{if(audio.musicGain)audio.musicGain.gain.value=+e.target.value;};
$('sfxVolume').oninput=e=>{if(audio.sfxGain)audio.sfxGain.gain.value=+e.target.value;};
document.title=cfg.title;
document.querySelector('h1').firstChild.textContent=cfg.title;
$('best').textContent=best;
$('cloudStatus').textContent=Cloud.enabled?'云端待连接':'本地模式';
R.forEach((_,i)=>{const d=document.createElement('div'),im=images[i].cloneNode();im.alt=`第 ${i+1} 级`;d.append(im,document.createTextNode(String(i+1)));$('levels').append(d);});
// Only publish increasing personal bests, throttled to avoid excessive API traffic.
let lastCloudBest=0, queuedCloudBest=0, cloudTimer=null, cloudBusy=false;
function queueCloudScore(value, immediate=false){
 if(!Cloud.enabled || !name || !Number.isFinite(value) || value<=0)return;
 queuedCloudBest=Math.max(queuedCloudBest,value);
 if(cloudTimer)clearTimeout(cloudTimer);
 cloudTimer=setTimeout(flushCloudScore,immediate?0:1800);
}
async function flushCloudScore(){
 cloudTimer=null;
 if(cloudBusy || queuedCloudBest<=lastCloudBest)return;
 cloudBusy=true;
 const target=queuedCloudBest;
 try{
  await Cloud.profile(name);
  await Cloud.submit(target);
  lastCloudBest=Math.max(lastCloudBest,target);
  $('cloudStatus').textContent='云端已连接';
  if($('ranking').open)await refreshRanks();
 }catch(e){
  $('cloudStatus').textContent='同步待重试';
  console.warn('成绩同步失败',e);
 }finally{
  cloudBusy=false;
  if(queuedCloudBest>lastCloudBest && !cloudTimer)cloudTimer=setTimeout(flushCloudScore,10000);
 }
}
function updateScore(){ $('score').textContent=score;$('best').textContent=best; }

function newRound(){
 achieved=false;round++;balls=[];particles=[];score=0;bestBefore=best;current=rand();next=rand();elapsed=0;cooldown=.25;danger=0;rankBefore=null;celebrated=false;running=true;started=true;aim=W/2;
 $('nextImage').src=images[next].src;$('danger').style.display='none';updateScore();
 const id=round;if(Cloud.enabled)Cloud.board().then(b=>{if(id===round){rankBefore=b.me?.rank??null;best=Math.max(best,b.me?.best||0);bestBefore=Math.max(bestBefore,b.me?.best||0);lastCloudBest=Math.max(lastCloudBest,b.me?.best||0);save();updateScore();}}).catch(()=>{});
}
function ball(level,x,y){return{level,x,y,vx:0,vy:0,r:R[level],angle:0,age:0,contact:false};}
function drop(){if(!running||cooldown>0||document.querySelector('dialog[open]'))return;audioInit();balls.push(ball(current,Math.max(R[current],Math.min(W-R[current],aim)),70));current=next;next=rand();$('nextImage').src=images[next].src;cooldown=.45;}
canvas.onpointerdown=e=>{canvas.setPointerCapture(e.pointerId);move(e);};
canvas.onpointermove=move;
function move(e){const rect=canvas.getBoundingClientRect();aim=(e.clientX-rect.left)*W/rect.width;}
canvas.onpointerup=e=>{move(e);drop();};
canvas.onkeydown=e=>{if(['ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();if(e.key==='ArrowLeft')aim=Math.max(R[current],aim-14);if(e.key==='ArrowRight')aim=Math.min(W-R[current],aim+14);if(e.key===' ')drop();};
function burst(x,y){for(let i=0;i<13;i++)particles.push({x,y,vx:(Math.random()-.5)*180,vy:(Math.random()-.5)*180,life:.55});}
function physics(dt){
 elapsed+=dt;cooldown=Math.max(0,cooldown-dt);
 for(const b of balls){b.age+=dt;b.vy+=850*dt;b.vx*=Math.exp(-.25*dt);b.x+=b.vx*dt;b.y+=b.vy*dt;b.angle+=b.vx*dt/b.r;
  if(b.x<b.r){b.x=b.r;b.vx=Math.abs(b.vx)*.3;}if(b.x>W-b.r){b.x=W-b.r;b.vx=-Math.abs(b.vx)*.3;}
  if(b.y>H-b.r){b.y=H-b.r;b.vy=-Math.abs(b.vy)*.15;b.vx*=.97;b.contact=true;}
 }
 for(let pass=0;pass<6;pass++){
  const removed=new Set(),born=[];
  for(let i=0;i<balls.length;i++)for(let j=i+1;j<balls.length;j++){
   const a=balls[i],b=balls[j];if(removed.has(a)||removed.has(b))continue;
   let dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),sum=a.r+b.r;if(d>=sum)continue;
   a.contact=b.contact=true;
   if(a.level===b.level){removed.add(a);removed.add(b);const x=(a.x+b.x)/2,y=(a.y+b.y)/2;
    if(a.level<R.length-1){const c=ball(a.level+1,x,y);c.vx=(a.vx+b.vx)/2;c.vy=(a.vy+b.vy)/2;c.contact=true;born.push(c);
     if(c.level===R.length-1&&!achieved){achieved=true;queueMicrotask(()=>openCelebration('恭喜你合成大珍猪！！','最终等级达成！关闭庆祝页面后，可以继续这一局。'));}}
    score+=(a.level+1)*10;if(score>best){best=score;save();queueCloudScore(best);}updateScore();burst(x,y);playMerge();continue;}
   if(d<.0001){dx=.01;dy=0;d=.01;}const nx=dx/d,ny=dy/d,ia=1/(a.r*a.r),ib=1/(b.r*b.r),total=ia+ib;
   const correction=(sum-d)*.85;a.x-=nx*correction*ia/total;a.y-=ny*correction*ia/total;b.x+=nx*correction*ib/total;b.y+=ny*correction*ib/total;
   const rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
   if(rel<0){const imp=-1.08*rel/total;a.vx-=imp*ia*nx;a.vy-=imp*ia*ny;b.vx+=imp*ib*nx;b.vy+=imp*ib*ny;}
  }
  if(removed.size)balls=balls.filter(b=>!removed.has(b)).concat(born);
  for(const b of balls){b.x=Math.max(b.r,Math.min(W-b.r,b.x));b.y=Math.min(H-b.r,b.y);}
 }
 const overflowing=balls.some(b=>b.age>1.1&&b.contact&&b.y-b.r<LINE&&Math.abs(b.vy)<65);
 danger=overflowing?danger+dt:Math.max(0,danger-2*dt);$('danger').style.display=danger>.25?'block':'none';if(danger>1.25)finish();
 for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);
}
function drawBall(c,b){c.save();c.translate(b.x,b.y);c.rotate(b.angle||0);c.beginPath();c.arc(0,0,b.r,0,Math.PI*2);c.fillStyle='#e8cff7';c.fill();c.clip();const im=images[b.level];if(im.complete&&im.naturalWidth){const size=Math.min(im.naturalWidth,im.naturalHeight);c.drawImage(im,(im.naturalWidth-size)/2,(im.naturalHeight-size)/2,size,size,-b.r,-b.r,b.r*2,b.r*2);}c.restore();c.beginPath();c.arc(b.x,b.y,b.r,0,Math.PI*2);c.strokeStyle='#fffdf5';c.lineWidth=2;c.stroke();}
function render(){ctx.clearRect(0,0,W,H);ctx.setLineDash([8,8]);ctx.strokeStyle=danger>.25?'#b53064':'#ba8299aa';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,LINE);ctx.lineTo(W,LINE);ctx.stroke();ctx.setLineDash([]);ctx.font='11px system-ui';ctx.fillStyle='#936979';ctx.fillText('不要超过这条线哦',14,LINE-9);
 for(const b of balls)drawBall(ctx,b);
 if(running){const x=Math.max(R[current],Math.min(W-R[current],aim));ctx.setLineDash([4,8]);ctx.strokeStyle='#fff7';ctx.beginPath();ctx.moveTo(x,70);ctx.lineTo(x,H);ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=cooldown>0?.45:1;drawBall(ctx,{x,y:70,r:R[current],level:current});ctx.globalAlpha=1;}
 for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/.55);ctx.fillStyle='#fff3bb';ctx.beginPath();ctx.arc(p.x,p.y,3,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
}
let last=0,acc=0;function loop(t){const dt=Math.min((t-last)/1000||0, .04);last=t;if(running&&!document.hidden&&!document.querySelector('dialog[open]')){acc+=dt;while(acc>=1/120){physics(1/120);acc-=1/120;if(!running)break;}}else acc=0;render();requestAnimationFrame(loop);}requestAnimationFrame(loop);
function celebrate(){if(celebrated)return;celebrated=true;openCelebration($('resultTitle').textContent,$('resultDetail').textContent);}
function openCelebration(title,detail){
 $('celebrationTitle').textContent=title;$('celebrationDetail').textContent=detail;
 if(celebrationActive)return;
 celebrationActive=true;const token=++celebrationToken;
 $('celebration').showModal();startCelebrationAudio();
 if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const c=$('confetti'),cx=c.getContext('2d');const width=innerWidth,height=innerHeight;c.width=width;c.height=height;c.style.display='block';
 const flock=Array.from({length:36},()=>{const r=18+Math.random()*38;return{x:Math.random()*width,y:-100-Math.random()*height*.7,r,level:Math.floor(Math.random()*R.length),angle:0,vx:(Math.random()-.5)*300,vy:100+Math.random()*200};});let t0=performance.now(),prev=t0;
 function frame(t){if(!celebrationActive||token!==celebrationToken)return;const dt=Math.min(.03,(t-prev)/1000);prev=t;cx.clearRect(0,0,width,height);const age=(t-t0)/1000;cx.globalAlpha=1;
 for(const b of flock){b.vy+=550*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.angle+=b.vx*dt/b.r;if(b.x<b.r||b.x>width-b.r){b.vx*=-.85;b.x=Math.max(b.r,Math.min(width-b.r,b.x));}if(b.y>height-b.r){b.y=height-b.r;b.vy=-Math.abs(b.vy)*.65;}drawBall(cx,b);}
 for(let i=0;i<flock.length;i++)for(let j=i+1;j<flock.length;j++){const a=flock[i],b=flock[j],dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy),s=a.r+b.r;if(d>0&&d<s){const nx=dx/d,ny=dy/d,p=(s-d)/2;a.x-=nx*p;a.y-=ny*p;b.x+=nx*p;b.y+=ny*p;const v=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(v<0){a.vx+=v*nx*.75;a.vy+=v*ny*.75;b.vx-=v*nx*.75;b.vy-=v*ny*.75;}}}
 requestAnimationFrame(frame);}requestAnimationFrame(frame);
}
let pendingScore=0;try{pendingScore=Number(localStorage.getItem('merge-pending'))||0;}catch{}
async function syncScore(id){
 if(!Cloud.enabled)return;
 $('retrySync').hidden=true;$('syncStatus').textContent='正在同步成绩…';
 try{await Cloud.profile(name);const b=await Cloud.submit(Math.max(pendingScore,best));lastCloudBest=Math.max(lastCloudBest,best,pendingScore);pendingScore=0;localStorage.removeItem('merge-pending');if(id!==round)return;$('cloudStatus').textContent='云端已连接';$('syncStatus').textContent=`成绩已保存 · 当前第 ${b.rank} 名`;
 if(rankBefore!==null&&b.rank<rankBefore){$('resultTitle').textContent='排名进步啦！';$('resultDetail').textContent=`第 ${rankBefore} 名 → 第 ${b.rank} 名 · 个人最高 ${best} 分`;celebrate();}
 }catch(e){if(id!==round)return;$('syncStatus').textContent='成绩已保存在此浏览器，云端同步失败：'+e.message;$('retrySync').hidden=false;}
}
function finish(){if(!running)return;running=false;save();$('finalScore').textContent=score;$('resultTitle').textContent=score>bestBefore?'新纪录！太棒啦 ✦':'这一局，快乐满分';$('resultDetail').textContent=`个人最高 ${best} 分${score>bestBefore?' · 提升 '+(score-bestBefore)+' 分':''}`;$('syncStatus').textContent=Cloud.enabled?'':'本地成绩已保存；配置云端后即可参与共享排行。';$('result').showModal();if(score>bestBefore)celebrate();
 if(Cloud.enabled){pendingScore=Math.max(pendingScore,score,best);try{localStorage.setItem('merge-pending',pendingScore);}catch{}queueCloudScore(best,true);syncScore(round);}}
async function showRanks(){
 if(!$('ranking').open)$('ranking').showModal();
 $('myRank').textContent=Cloud.enabled?'正在加载…':'当前为本地模式，尚未连接共享排行榜。';
 if(Cloud.enabled)await refreshRanks();
}
async function refreshRanks(){
 if(!Cloud.enabled||!$('ranking').open)return;
 try{
  const b=await Cloud.board();
  $('rankList').replaceChildren();
  $('myRank').textContent=b.me?`我的排名：第 ${b.me.rank} 名 · ${b.me.best} 分`:'尚未上榜';
  for(const p of (b.top||[])){
   const row=document.createElement('div');row.className='rankrow'+(p.id===Cloud.id?' me':'');
   [p.rank,p.nickname,p.best+' 分'].forEach(v=>{const el=document.createElement('span');el.textContent=v;row.append(el);});
   $('rankList').append(row);
  }
 }catch(e){$('myRank').textContent='暂时无法获取排名：'+e.message;}
}
$('nameForm').onsubmit=async e=>{e.preventDefault();const n=$('nickname').value.trim();if(!n)return;audioInit();name=n;save();$('playerName').textContent='你好，'+name;$('startBtn').disabled=true;
 if(Cloud.enabled){$('startStatus').textContent='正在连接排行榜…';try{await Cloud.profile(name);$('cloudStatus').textContent='云端已连接';queueCloudScore(best,true);}catch(e){$('cloudStatus').textContent='暂时离线';toast('暂时进入本地游戏：'+e.message);}}
 $('startBtn').disabled=false;$('welcome').close();newRound();};
$('settingsBtn').onclick=()=>{$('settings').showModal();audioInit();};$('rankBtn').onclick=showRanks;$('refreshRank').onclick=showRanks;
$('resultRank').onclick=showRanks;$('retrySync').onclick=()=>syncScore(round);
$('restartBtn').onclick=()=>{if(running)$('confirmRestart').showModal();};$('finishBtn').onclick=()=>{$('confirmRestart').close();finish();};
$('closeCelebration').onclick=()=>{$('celebration').close();stopCelebration();};
$('celebration').addEventListener('close',stopCelebration);
$('celebration').addEventListener('cancel',stopCelebration);
$('againBtn').onclick=()=>{stopCelebration();$('result').close();audioInit();newRound();};
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>$(b.dataset.close).close();
$('welcome').addEventListener('cancel',e=>e.preventDefault());$('result').addEventListener('cancel',e=>e.preventDefault());
$('nickname').value=name;$('welcome').showModal();
document.addEventListener('visibilitychange',()=>{last=performance.now();});

// Poll while the leaderboard is visible; no paid realtime channel needed.
setInterval(()=>{if($('ranking').open && !document.hidden)refreshRanks();},7000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden && $('ranking').open)refreshRanks();});
