'use strict';
const $=id=>document.getElementById(id), cfg=window.GAME_CONFIG;
const W=430,H=660,R=[13,17,22,28,35,43,52,62,73,85,98,110,124], LINE=142;
const canvas=$('game'),ctx=canvas.getContext('2d');
const images=R.map((_,i)=>{const im=new Image(); im.src=`assets/images/${String(i+1).padStart(2,'0')}.jpg`;return im;});
let stored={};try{stored=JSON.parse(localStorage.getItem('merge-player')||'{}');}catch{}
let name=stored.name||'',best=stored.best||0,bestBefore=best,score=0,balls=[],particles=[],next=0,current=0,aim=W/2;
let cloudReady=false;
let achieved=false, celebrationActive=false, celebrationToken=0;
let running=false,started=false,cooldown=0,danger=0,rankBefore=null,celebrated=false,round=0,elapsed=0;
const save=()=>{try{localStorage.setItem('merge-player',JSON.stringify({name,best}));}catch{toast('浏览器存储不可用，记录可能无法保留');}};
const toast=t=>{$('toast').textContent=t;$('toast').style.display='block';clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').style.display='none',4000);};
const rand=()=>Math.floor(Math.random()*4);
const audio={context:null,music:null,musicGain:null,sfxGain:null,buffers:[],musicSource:null,loading:null,celebrationBuffer:null,celebrationSource:null};
// Native media playback offers an independent route when Web Audio is silent on a device.
let nativeMode=true;
const nativeAudio={music:null,celebration:null,voices:[],last:'等待点击开始',primed:false};
function nativeNode(src,loop=false){const a=new Audio(src);a.preload='auto';a.loop=loop;a.setAttribute('playsinline','');return a;}
function mediaError(label,e){nativeAudio.last=label+'未播放：'+(e?.name==='NotAllowedError'?'浏览器拦截，请点“开启声音／试听”':e?.message||'检查网络和媒体文件');nativeStatus();}
function nativeStatus(){
 if(!nativeMode)return;
 const music=nativeAudio.music;
 $('audioStatus').textContent=(music&&!music.paused?'背景音乐播放中 '+Math.floor(music.currentTime)+' 秒':'背景音乐未播放')+' · '+nativeAudio.last;
}
function nativeInit(){
 if(!nativeAudio.music){
  nativeAudio.music=$('bgmPlayer');nativeAudio.music.volume=Number($('musicVolume').value);nativeAudio.music.loop=true;
  nativeAudio.celebration=nativeNode('assets/audio/celebration.mp3',true);
  nativeAudio.celebration.volume=Number($('sfxVolume').value);
  for(let i=0;i<14;i++)nativeAudio.voices.push(nativeNode(`assets/audio/merge-${String(i+1).padStart(2,'0')}.mp3`));
  nativeAudio.music.addEventListener('timeupdate',nativeStatus);
  nativeAudio.music.addEventListener('error',()=>mediaError('背景音乐',Error('音频无法加载')));
 }
 // Call play synchronously inside the start / touch gesture, not after a database request.
 if(nativeAudio.music.paused)nativeAudio.music.play().then(nativeStatus).catch(e=>mediaError('背景音乐',e));
 if(!nativeAudio.primed){
  nativeAudio.primed=true;
  for(const a of [...nativeAudio.voices,nativeAudio.celebration]){
   a.muted=true;
   a.play().then(()=>{if(!a.inUse){a.pause();a.currentTime=0;}a.muted=false;}).catch(()=>{a.muted=false;});
  }
 }
 nativeStatus();
}
function nativeMerge(){
 if(!nativeAudio.music)nativeInit();
 const i=Math.floor(Math.random()*14),base=nativeAudio.voices[i];
 // An overlapping merge gets its own source, so no previous effect is interrupted.
 const a=base.paused?base:nativeNode(base.src);a.inUse=true;a.muted=false;a.volume=Number($('sfxVolume').value);a.currentTime=0;
 a.onended=()=>{a.inUse=false;};
 a.play().then(()=>{nativeAudio.last='合成音效 '+(i+1)+' 播放中';nativeStatus();}).catch(e=>{a.inUse=false;mediaError('合成音效',e);});
}
function nativeCelebration(){
 if(!nativeAudio.music)nativeInit();
 const a=nativeAudio.celebration;if(a.inUse)return;a.inUse=true;a.muted=false;a.volume=Number($('sfxVolume').value);a.currentTime=0;
 a.play().catch(e=>mediaError('庆祝音效',e));
}
$('audioMode').onchange=e=>{
 nativeMode=e.target.value==='native';
 if(nativeAudio.music)nativeAudio.music.pause();
 if(nativeAudio.celebration){nativeAudio.celebration.pause();nativeAudio.celebration.inUse=false;}
 if(nativeAudio.voices)nativeAudio.voices.forEach(a=>a.pause());
 if(audio.context){if(nativeMode)audio.context.suspend();else audio.context.resume();}
 audioInit();if(celebrationActive)startCelebrationAudio();
};
function audioInit(){
 if(nativeMode){nativeInit();return;}
 try {
  if(!audio.context){
   audio.context=new (window.AudioContext||window.webkitAudioContext)();
   audio.musicGain=audio.context.createGain();audio.musicGain.gain.value=Number($('musicVolume').value);audio.musicGain.connect(audio.context.destination);
   audio.sfxGain=audio.context.createGain();audio.sfxGain.gain.value=Number($('sfxVolume').value);audio.sfxGain.connect(audio.context.destination);
   audio.context.onstatechange=()=>{if(audio.context.state==='running')flushMergeSounds();};
  }
  audio.context.resume().then(flushMergeSounds).catch(()=>{$('audioStatus').textContent='请点击“试听合成音效”开启声音';});
  if(!audio.loading&&Date.now()>(audio.retryAfter||0)){
   const decode=async path=>{const r=await fetch(path,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(path+' 加载失败');return audio.context.decodeAudioData(await r.arrayBuffer());};
   const jobs=[];
   if(!audio.music)jobs.push(decode('assets/audio/bgm.mp3').then(buffer=>{audio.music=buffer;const source=audio.context.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(audio.musicGain);source.start();audio.musicSource=source;}));
   if(!audio.celebrationBuffer)jobs.push(decode('assets/audio/celebration.mp3').then(buffer=>{audio.celebrationBuffer=buffer;if(celebrationActive)startCelebrationAudio();}));
   for(let i=0;i<14;i++)if(!audio.buffers[i])jobs.push(decode(`assets/audio/merge-${String(i+1).padStart(2,'0')}.mp3`).then(buffer=>{audio.buffers[i]=buffer;flushMergeSounds();}));
   if(jobs.length){
    $('audioStatus').textContent='正在加载你的音效…';
    audio.loading=Promise.allSettled(jobs).then(results=>{
     const count=audio.buffers.filter(Boolean).length;
     $('audioStatus').textContent=`合成音效已加载 ${count}/14 段`;
     if(results.some(r=>r.status==='rejected')){$('audioStatus').textContent+=' · 部分声音加载失败，点击试听可重试';toast('部分声音加载失败，请在声音设置中点击试听重试');audio.retryAfter=Date.now()+10000;}
    }).finally(()=>{audio.loading=null;});
   }
  }
 }catch(e){$('audioStatus').textContent='声音初始化失败，点击试听重试';}
}
// One event per actual merge. Keep events while buffers load or the browser suspends audio.
let mergeSoundQueue=0;
function flushMergeSounds(){
 if(!audio.context||audio.context.state!=='running')return;
 const ready=audio.buffers.filter(Boolean);if(!ready.length)return;
 let offset=0;
 while(mergeSoundQueue>0){
  const source=audio.context.createBufferSource();source.buffer=ready[Math.floor(Math.random()*ready.length)];source.connect(audio.sfxGain);source.onended=()=>source.disconnect();source.start(audio.context.currentTime+offset);offset+=.035;mergeSoundQueue--;
 }
}
function startCelebrationAudio(){
 if(nativeMode){if(celebrationActive)nativeCelebration();return;}
 if(!celebrationActive||!audio.celebrationBuffer||audio.celebrationSource)return;
 const source=audio.context.createBufferSource();source.buffer=audio.celebrationBuffer;source.loop=true;source.connect(audio.sfxGain);source.start();audio.celebrationSource=source;
}
function stopCelebration(){
 if(nativeAudio.celebration){nativeAudio.celebration.pause();nativeAudio.celebration.currentTime=0;nativeAudio.celebration.inUse=false;}
 celebrationActive=false;celebrationToken++;
 if(audio.celebrationSource){audio.celebrationSource.stop();audio.celebrationSource.disconnect();audio.celebrationSource=null;}
 $('confetti').style.display='none';
}
function playMerge(){if(nativeMode){nativeMerge();return;}mergeSoundQueue++;flushMergeSounds();}
$('testSfx').onclick=()=>{audio.retryAfter=0;audioInit();playMerge();};
$('musicVolume').value=cfg.musicVolume;$('sfxVolume').value=cfg.sfxVolume;
$('musicVolume').oninput=e=>{if(nativeAudio.music)nativeAudio.music.volume=+e.target.value;if(audio.musicGain)audio.musicGain.gain.value=+e.target.value;};
$('sfxVolume').oninput=e=>{if(nativeAudio.celebration)nativeAudio.celebration.volume=+e.target.value;nativeAudio.voices.forEach(a=>a.volume=+e.target.value);if(audio.sfxGain)audio.sfxGain.gain.value=+e.target.value;};
document.title=cfg.title;
document.querySelector('h1').firstChild.textContent=cfg.title;
$('best').textContent=best;
$('cloudStatus').textContent=Cloud.enabled?'云端待连接':'本地模式';
R.forEach((_,i)=>{const d=document.createElement('div'),im=images[i].cloneNode();im.alt=`第 ${i+1} 级`;d.append(im,document.createTextNode(String(i+1)));$('levels').append(d);});
function updateScore(){ $('score').textContent=score;$('best').textContent=best; }
function newRound(){
 achieved=false;round++;balls=[];particles=[];score=0;bestBefore=best;current=rand();next=rand();elapsed=0;cooldown=.25;danger=0;rankBefore=null;celebrated=false;running=true;started=true;aim=W/2;
 $('nextImage').src=images[next].src;$('danger').style.display='none';updateScore();
 const id=round;if(Cloud.enabled&&cloudReady)refreshCloudBoard(id);
}
function cloudFailure(e){cloudReady=false;$('cloudStatus').textContent='本地模式 · 云端暂不可用';$('cloudStatus').title=e?.message||'连接失败';}
async function refreshCloudBoard(id){
 try{const b=await Cloud.board();cloudReady=true;$('cloudStatus').textContent='云端已连接';$('cloudStatus').title='';
 if(id===round){rankBefore=b.me?.rank??null;best=Math.max(best,b.me?.best||0);bestBefore=Math.max(bestBefore,b.me?.best||0);save();updateScore();}
 }catch(e){cloudFailure(e);}

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
    score+=(a.level+1)*10;if(score>best){best=score;save();}updateScore();burst(x,y);playMerge();continue;}
   if(d<.0001){dx=.01;dy=0;d=.01;}const nx=dx/d,ny=dy/d,ia=1/(a.r*a.r),ib=1/(b.r*b.r),total=ia+ib;
   const correction=(sum-d)*.85;a.x-=nx*correction*ia/total;a.y-=ny*correction*ia/total;b.x+=nx*correction*ib/total;b.y+=ny*correction*ib/total;
   const rel=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
   if(rel<0){const imp=-1.08*rel/total;a.vx-=imp*ia*nx;a.vy-=imp*ia*ny;b.vx+=imp*ib*nx;b.vy+=imp*ib*ny;}
  }
  if(removed.size)balls=balls.filter(b=>!removed.has(b)).concat(born);
  for(const b of balls){b.x=Math.max(b.r,Math.min(W-b.r,b.x));b.y=Math.min(H-b.r,b.y);}
 }
 const overflowing=balls.some(b=>b.age>1.5&&b.contact&&b.y-b.r<LINE&&Math.abs(b.vy)<55);
 danger=overflowing?danger+dt:Math.max(0,danger-2*dt);$('danger').style.display=danger>.25?'block':'none';if(danger>2)finish();
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
 try{await Cloud.profile(name);const b=await Cloud.submit(pendingScore);pendingScore=0;localStorage.removeItem('merge-pending');if(id!==round)return;$('cloudStatus').textContent='云端已连接';$('syncStatus').textContent=`成绩已保存 · 当前第 ${b.rank} 名`;
 if(rankBefore!==null&&b.rank<rankBefore){$('resultTitle').textContent='排名进步啦！';$('resultDetail').textContent=`第 ${rankBefore} 名 → 第 ${b.rank} 名 · 个人最高 ${best} 分`;celebrate();}
 }catch(e){if(id!==round)return;$('cloudStatus').textContent='本地模式 · 云端暂不可用';$('syncStatus').textContent='成绩已保存在此浏览器，云端同步失败：'+e.message;$('retrySync').hidden=false;}
}
function finish(){if(!running)return;running=false;save();$('finalScore').textContent=score;$('resultTitle').textContent=score>bestBefore?'新纪录！太棒啦 ✦':'这一局，快乐满分';$('resultDetail').textContent=`个人最高 ${best} 分${score>bestBefore?' · 提升 '+(score-bestBefore)+' 分':''}`;$('syncStatus').textContent=Cloud.enabled?'':'本地成绩已保存；配置云端后即可参与共享排行。';$('result').showModal();if(score>bestBefore)celebrate();
 if(Cloud.enabled){pendingScore=Math.max(pendingScore,score);try{localStorage.setItem('merge-pending',pendingScore);}catch{}syncScore(round);}}
async function showRanks(){if(!$('ranking').open)$('ranking').showModal();$('rankList').replaceChildren();$('myRank').textContent=Cloud.enabled?'正在加载…':'当前为本地模式，尚未连接共享排行榜。';if(!Cloud.enabled)return;
 try{const b=await Cloud.board();cloudReady=true;$('cloudStatus').textContent='云端已连接';$('cloudStatus').title='';$('myRank').textContent=b.me?`我的排名：第 ${b.me.rank} 名 · ${b.me.best} 分`:'完成一局即可参与排名';for(const p of b.top){const row=document.createElement('div');row.className='rankrow'+(p.id===Cloud.id?' me':'');[p.rank,p.nickname,p.best+' 分'].forEach(v=>{const el=document.createElement('span');el.textContent=v;row.append(el);});$('rankList').append(row);}}
 catch(e){$('myRank').textContent='暂时无法获取排名：'+e.message;}}
$('nameForm').onsubmit=e=>{
 e.preventDefault();const n=$('nickname').value.trim();if(!n)return;
 audioInit();name=n;save();$('playerName').textContent='你好，'+name;
 // Start locally immediately. Database quotas, timeouts and auth never gate play.
 $('welcome').close();newRound();
 if(Cloud.enabled){$('cloudStatus').textContent='游戏已开始 · 云端连接中';
  const id=round;Cloud.profile(name).then(()=>{cloudReady=true;return refreshCloudBoard(id);}).catch(cloudFailure);
 }
};
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
