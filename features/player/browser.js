import videojs from 'video.js';
import 'videojs-contrib-ads';
import 'videojs-ima';
import 'video.js/dist/video-js.css';
import 'videojs-ima/dist/videojs.ima.css';
import './player.css';
export function PlexaVideoPlayer(element,config){
 const status=document.getElementById('status'),measurement=document.getElementById('measurement'),advertising=document.getElementById('advertising');
 document.documentElement.style.setProperty('--player-accent',config.accent||'#48ded0');
 const player=videojs(element,{controls:true,autoplay:false,playsinline:true,preload:'metadata',fluid:true,aspectRatio:'16:9',responsive:true,playbackRates:[.5,1,1.25,1.5,2]});
 const playbackId=crypto.randomUUID(),seen=new Set();let contentStarted=false,adsReady=false,adTimer,disposed=false;
 const inAd=()=>!!player.ads?.isInAdMode();
 const emit=(event,code)=>{if(!measurement?.checked||seen.has(event))return;seen.add(event);fetch('/api/player/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({videoId:config.id,destinationId:config.destinationId,event,playbackId,consent:true,device:innerWidth<600?'mobile':innerWidth<1024?'tablet':'desktop',articleId:config.articleId||undefined,code}),keepalive:true}).catch(()=>{});};
 measurement?.addEventListener('change',()=>{if(measurement.checked){emit('load');if(contentStarted)emit('start');}});
 player.on('playing',()=>{if(inAd())return;contentStarted=true;status.textContent='';if(advertising)advertising.disabled=true;emit('start');});
 player.on('timeupdate',()=>{if(inAd()||!contentStarted)return;const duration=player.duration();if(!duration||!Number.isFinite(duration))return;const progress=player.currentTime()/duration;for(const n of [25,50,75])if(progress>=n/100)emit('progress'+n);});
 player.on('ended',()=>{if(!inAd()&&contentStarted)emit('complete');});
 player.on('error',()=>{status.textContent='This video could not be played. Try opening it directly below.';emit('error',String(player.error()?.code||'unknown'));});
 const resume=()=>{clearTimeout(adTimer);if(disposed)return;status.textContent='';try{player.ima?.getAdsManager()?.destroy();if(inAd())player.ads.endLinearAdMode();}catch{}player.play()?.catch(()=>{status.textContent='Press play to continue.';});};
 player.on('adserror',()=>{emit('ad-error','ima');resume();});player.on('adtimeout',()=>{emit('ad-error','timeout');resume();});
 player.on('ads-ad-started',()=>{clearTimeout(adTimer);status.textContent='Advertisement';});
 player.on('contentresumed',()=>{status.textContent='';});
 player.on('ads-manager',event=>{const types=window.google.ima.AdEvent.Type;event.adsManager.addEventListener(types.IMPRESSION,()=>emit('ad-impression'));event.adsManager.addEventListener(types.COMPLETE,()=>emit('ad-complete'));});
 advertising?.addEventListener('change',async()=>{
  if(!advertising.checked){adsReady=false;try{player.ima?.changeAdTag(null);}catch{}status.textContent='';return;}
  if(!config.ads.enabled||!config.ads.tag||contentStarted)return;
  status.textContent='Preparing optional advertisement…';
  try{await new Promise((resolve,reject)=>{if(window.google?.ima)return resolve();const s=document.createElement('script');s.src='https://imasdk.googleapis.com/js/sdkloader/ima3.js';s.onload=resolve;s.onerror=reject;document.head.append(s);setTimeout(()=>reject(Error('SDK timeout')),5000);});if(disposed||contentStarted||!advertising.checked){status.textContent='';return;}
   player.ima({adTagUrl:config.ads.tag,preventLateAdStart:true,vastLoadTimeout:5000,contribAdsSettings:{timeout:5000,prerollTimeout:5000}});adsReady=true;status.textContent='Press play.';
  }catch{status.textContent='Advertisement unavailable. Press play to watch the video.';emit('ad-error','sdk');}
 });
 const gesture=()=>{if(adsReady&&!contentStarted){player.ima.initializeAdDisplayContainer();adTimer=setTimeout(resume,7000);adsReady=false;}};
 player.el().addEventListener('pointerdown',gesture);player.el().addEventListener('keydown',gesture);
 player.on('dispose',()=>{disposed=true;clearTimeout(adTimer);});
 return player;
}
const config=document.getElementById('player-config');if(config)PlexaVideoPlayer(document.getElementById('video'),JSON.parse(config.textContent));
