import videojs from 'video.js';
import 'videojs-contrib-ads';
import 'videojs-ima';
import 'video.js/dist/video-js.css';
import 'videojs-ima/dist/videojs.ima.css';
import './player.css';
import {showNextPreview} from './preview.mjs';
export function PlexaVideoPlayer(element,config){
 const status=document.getElementById('status'),measurement=document.getElementById('measurement'),advertising=document.getElementById('advertising');
 document.documentElement.style.setProperty('--player-accent',config.accent||'#48ded0');
 element.muted=true;element.defaultMuted=true;element.autoplay=true;element.playsInline=true;
 const player=videojs(element,{controls:true,autoplay:true,muted:true,playsinline:true,preload:'auto',fluid:true,aspectRatio:'16:9',responsive:true,playbackRates:[.5,1,1.25,1.5,2]});
 const playbackId=crypto.randomUUID(),seen=new Set(),queue=Array.isArray(config.queue)?config.queue:[];let contentStarted=false,adsReady=false,adTimer,disposed=false,queueIndex=0;
 const inAd=()=>typeof player.ads?.isInAdMode==='function'&&player.ads.isInAdMode();
 const emit=(event,code)=>{if(!measurement?.checked||seen.has(event))return;seen.add(event);fetch('/api/player/events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({videoId:config.id,destinationId:config.destinationId,event,playbackId,consent:true,device:innerWidth<600?'mobile':innerWidth<1024?'tablet':'desktop',articleId:config.articleId||undefined,code}),keepalive:true}).catch(()=>{});};
 measurement?.addEventListener('change',()=>{if(measurement.checked){emit('load');if(contentStarted)emit('start');}});
 player.on('playing',()=>{if(inAd())return;contentStarted=true;status.textContent='';if(advertising)advertising.disabled=true;emit('start');});
 player.on('timeupdate',()=>{if(inAd()||!contentStarted)return;const duration=player.duration();if(!duration||!Number.isFinite(duration))return;const progress=player.currentTime()/duration;for(const n of [25,50,75])if(progress>=n/100)emit('progress'+n);});
 // Overlays live inside Video.js so they also remain available in fullscreen.
 const sound=document.createElement('button');sound.type='button';sound.className='plexa-sound';
 const updateSound=()=>{const muted=player.muted()||player.volume()===0;sound.textContent=muted?'Tap for sound':'Mute sound';sound.setAttribute('aria-label',muted?'Turn sound on':'Mute sound');sound.setAttribute('aria-pressed',String(!muted));};
 sound.addEventListener('click',()=>{const silent=player.muted()||player.volume()===0;if(silent&&player.volume()===0)player.volume(1);player.muted(!silent);updateSound();});
 player.on(['volumechange','loadedmetadata','playing'],updateSound);updateSound();player.el().append(sound);
 const nextButton=document.createElement('button');nextButton.type='button';nextButton.className='plexa-next';
 let failedThumbnail='';
 const nextImage=document.createElement('img');nextImage.alt='';nextImage.loading='lazy';nextImage.addEventListener('error',()=>{failedThumbnail=nextImage.getAttribute('src');nextImage.hidden=true;});
 const nextCopy=document.createElement('span'),nextLabel=document.createElement('span'),nextTitle=document.createElement('strong');nextLabel.textContent='Up next';nextCopy.append(nextLabel,nextTitle);nextButton.append(nextImage,nextCopy);player.el().append(nextButton);
 const updateNext=()=>{const next=queue[queueIndex+1];nextButton.hidden=!showNextPreview({hasNext:!!next,started:contentStarted,duration:player.duration(),currentTime:player.currentTime(),inAd:inAd()});if(!next)return;nextTitle.textContent=next.title;nextButton.setAttribute('aria-label','Play next: '+next.title);if(next.thumbnail&&nextImage.getAttribute('src')!==next.thumbnail){failedThumbnail='';nextImage.src=next.thumbnail;}nextImage.hidden=!next.thumbnail||failedThumbnail===next.thumbnail;};
 const advance=()=>{const next=queue[queueIndex+1];if(!next)return;queueIndex+=1;config.id=next.id;seen.clear();contentStarted=false;status.textContent='Next: '+next.title;for(let i=player.remoteTextTracks().length-1;i>=0;i--)player.removeRemoteTextTrack(player.remoteTextTracks()[i]);for(const cue of next.captions||[])player.addRemoteTextTrack({kind:'captions',src:cue.src,srclang:cue.language,label:cue.label},false);player.autoplay(false);player.poster(next.thumbnail);player.src({src:next.contentUrl,type:'video/mp4'});const download=document.getElementById('download');if(download)download.href=next.contentUrl;document.title=next.title+' · Plexa Video';player.el().setAttribute('aria-label',next.title);player.el().querySelector('video')?.setAttribute('aria-label',next.title);updateNext();player.play()?.catch(()=>{status.textContent='Press play for '+next.title;});};
 nextButton.addEventListener('click',()=>{if(!inAd())advance();});updateNext();
 player.on(['timeupdate','durationchange','seeking','playing'],updateNext);
 const startPlayback=()=>{if(disposed||contentStarted||inAd())return;player.play()?.catch(()=>{if(!disposed&&!contentStarted)status.textContent='Press play to watch the video.';});};
 player.one('canplay',startPlayback);player.ready(startPlayback);
 const brands=['football365','teamtalk','planetf1','planetfootball','planetrugby','loverugbyleague','cricket365','golf365','gpfans','grassrootgoals','racing365','sport365','tennis365'];
 const brandKey=String(config.brand||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 if(brands.includes(brandKey)){const logo=document.createElement('img');logo.className='plexa-brand';logo.alt=config.brand;logo.src='/brand-kit/assets/'+brandKey+'-icon.png';logo.addEventListener('error',()=>logo.remove());player.el().append(logo);}
 player.on('ended',()=>{if(inAd())return;if(contentStarted)emit('complete');advance();});
 player.on('ads-ad-started',()=>{nextButton.hidden=true;sound.hidden=true;});
 player.on('contentresumed',()=>{updateNext();sound.hidden=false;});
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
