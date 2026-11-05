/* Bundled local UI only. Rust holds credentials; no provider keys or tokens enter this page. */
const {invoke}=window.__TAURI__.core;
const win=window.__TAURI__.window.getCurrentWindow();
const $=id=>document.getElementById(id);
let previous=null,refreshTimer,notifications=false;
let saved={};try{saved=JSON.parse(localStorage.getItem('plexa.desktop.preferences')||'{}');}catch{/* Recover from invalid local preferences. */}
const report=text=>{$('connection').textContent=text;};
function save(){localStorage.setItem('plexa.desktop.preferences',JSON.stringify({top:$('top').checked,start:$('start').checked,notifications:$('notifications').checked}));}
window.plexaDesktop={
 request:async body=>{try{const result=await invoke('companion_request',{body:body||null});if(result.status===401){$('login').hidden=false;$('logout').hidden=true;previous=null;window.dispatchEvent(new Event('plexa:desktop-logout'));report('Session expired. Sign in again.');}return {ok:result.status>=200&&result.status<300,status:result.status,json:async()=>result.body};}catch(e){report(String(e));throw Error(String(e));}},
 hide:()=>win.hide(),drag:()=>win.startDragging(),projectId:()=>$('project').value.trim()||null,
 updated:data=>{$('account').classList.add('signed-in');$('login').hidden=true;$('logout').hidden=false;report('Connected · tools remain paused');
  if(previous&&notifications&&document.hidden){const changed=data.tasks.find(t=>previous.tasks.some(o=>o.id===t.id&&o.updatedAt!==t.updatedAt&&o.state!==t.state));const request=data.requests.find(r=>!previous.requests.some(o=>o.id===r.id));const reply=data.agents.find(a=>a.dialogue.length&&previous.agents.some(o=>o.id===a.id&&JSON.stringify(o.dialogue)!==JSON.stringify(a.dialogue)));if(changed||request||reply){const id=JSON.stringify(changed||request||reply?.dialogue.at(-1));if(localStorage.getItem('plexa.desktop.lastNotice')!==id){invoke('plugin:notification|notify',{options:{title:'Plexa Companion',body:'An agent update is ready. Open Plexa to review.'}}).catch(()=>{});localStorage.setItem('plexa.desktop.lastNotice',id);}}}previous=data;}
};
$('login').onclick=()=>invoke('begin_login').then(()=>report('Approve sign-in in your browser, then return here.')).catch(e=>report(String(e)));
$('logout').onclick=async()=>{try{await invoke('logout');previous=null;sessionStorage.clear();window.dispatchEvent(new Event('plexa:desktop-logout'));$('account').classList.remove('signed-in');$('login').hidden=false;$('logout').hidden=true;report('Signed out.');}catch(e){report(String(e));}};
$('drag').onpointerdown=()=>win.startDragging();$('hide').onclick=()=>win.hide();$('settings').onclick=()=>{$('preferences').hidden=!$('preferences').hidden;};
$('top').checked=saved.top!==false;void win.setAlwaysOnTop($('top').checked);$('top').onchange=()=>{void win.setAlwaysOnTop($('top').checked);save();};
$('start').checked=!!saved.start;$('start').onchange=save;if(saved.start)void win.hide();
$('notifications').checked=!!saved.notifications;notifications=!!saved.notifications;
$('notifications').onchange=async()=>{try{if($('notifications').checked){const granted=await invoke('plugin:notification|request_permission');$('notifications').checked=granted==='granted';}notifications=$('notifications').checked;save();}catch(e){$('notifications').checked=false;report(String(e));}};
invoke('plugin:autostart|is_enabled').then(v=>{$('autostart').checked=v;}).catch(()=>{});
$('autostart').onchange=()=>invoke('plugin:autostart|'+($('autostart').checked?'enable':'disable')).catch(e=>{report(String(e));$('autostart').checked=!$('autostart').checked;});
$('studio').onclick=()=>invoke('open_plexa',{path:'/workspace/studio'}).catch(e=>report(String(e)));
document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;e.preventDefault();invoke('open_plexa',{path:a.getAttribute('href')}).catch(e=>report(String(e)));});
window.__TAURI__.event.listen('desktop-auth',()=>{window.plexaCompanion?.open();});
window.__TAURI__.event.listen('desktop-auth-error',e=>report(e.payload));
// Read-only background checks support opted-in notifications; never replay a POST.
let refreshing=false;
function schedule(){clearInterval(refreshTimer);refreshTimer=setInterval(async()=>{
 if(refreshing)return;
 if(!document.hidden){window.dispatchEvent(new Event('plexa:route'));return;}
 if(!notifications||!previous)return;
 refreshing=true;
 try{const response=await window.plexaDesktop.request();if(response.ok)window.plexaDesktop.updated(await response.json());}catch{/* Keep the last snapshot offline. */}finally{refreshing=false;}
},document.hidden?90000:30000);}
document.addEventListener('visibilitychange',schedule);schedule();
