/* One companion for React pages and the hosted Studio. No execution endpoints. */
(()=>{
 if(window.plexaCompanion)return;
 const drafts={};let eyeData={};fetch('/agents/eyes.json').then(r=>r.ok?r.json():{}).then(value=>{eyeData=value;if(data)render();}).catch(()=>{});
 const eyeCss=document.createElement('link');eyeCss.rel='stylesheet';eyeCss.href='/agents/eyes.css';document.head.append(eyeCss);
 const api='/api/agents/companion';let data,selected,busy=false,expanded=false,hidden=true,minimised=false,settings=false,notice='',context=null,prefs,position,drag;
 const root=document.createElement('div');root.id='plexa-companion';root.setAttribute('role','complementary');root.setAttribute('aria-label','Plexa agents');document.body.append(root);
 const css=document.createElement('link');css.rel='stylesheet';css.href='/agents/companion.css';document.head.append(css);
 const el=(tag,text,attrs={})=>{const n=document.createElement(tag);if(text)n.textContent=text;for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
 const button=(text,fn,label)=>{const n=el('button',text,{type:'button'});if(label)n.setAttribute('aria-label',label);n.onclick=fn;return n;};
 const agent=()=>data?.agents.find(a=>a.id===selected);
 const remember=()=>{try{sessionStorage.setItem('plexa-companion:'+data.userId,JSON.stringify({selected,hidden,minimised,position}));}catch{}};
 async function request(body){const response=await fetch(api,{method:body?'POST':'GET',credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const result=await response.json();if(!response.ok){const error=Error(result.error||'Agent unavailable');error.result=result;error.status=response.status;throw error;}return result;}
 async function refresh(){if(busy||document.hidden)return;try{const next=await request();if(data&&data.userId!==next.userId){Object.keys(drafts).forEach(k=>delete drafts[k]);context=null;selected=next.preferences.defaultAgent;hidden=true;position=null;}if(prefs?.notifications&&data){const changed=next.tasks.find(t=>data.tasks.some(old=>old.id===t.id&&old.state!==t.state));if(changed)notice=changed.title+' · '+changed.state;}data=next;prefs=next.preferences;if(!next.agents.some(a=>a.id===selected))selected=next.agents[0]?.id;render();}catch(error){if([401,403].includes(error.status)){data=null;root.replaceChildren();return;}notice=error.message;render();}}
 async function savePreferences(){try{await request({action:'preferences',preferences:prefs});notice='Preferences saved.';}catch(error){notice=error.message;}render();}
 function clamp(){const viewport=window.visualViewport;const width=viewport?.width||document.documentElement.clientWidth;const height=viewport?.height||innerHeight;const left=viewport?.offsetLeft||0;const top=viewport?.offsetTop||0;root.style.maxWidth=Math.max(0,width-16)+'px';root.style.maxHeight=Math.max(0,height-16)+'px';if(!position&&(!viewport||viewport.scale===1)){root.style.left='';root.style.top='';root.style.right='';root.style.bottom='';return;}const desired=position||{x:left+width-root.offsetWidth-8,y:top+height-root.offsetHeight-8};const x=Math.max(left+8,Math.min(desired.x,left+width-root.offsetWidth-8));const y=Math.max(top+8,Math.min(desired.y,top+height-root.offsetHeight-8));if(position)position={x,y};root.style.left=x+'px';root.style.top=y+'px';root.style.right='auto';root.style.bottom='auto';}
 function render(){
  window.dispatchEvent(new CustomEvent('plexa:agent-state',{detail:{id:data?.agents.length&&!hidden&&!minimised?selected:null}}));
  if(!data?.agents.length){root.replaceChildren();return;}
  const active=agent();root.replaceChildren();root.className=hidden||minimised?'pc-compact':'';
  if(hidden||minimised){root.append(button(hidden?'Agents':active.name,()=>{hidden=false;minimised=false;remember();render();}));clamp();return;}
  const controls=el('div',null,{class:'pc-controls'});
  const move=button('↕',()=>{},'Move companion; use arrow keys');move.onpointerdown=e=>{if(e.button!==0)return;drag={x:e.clientX,y:e.clientY,left:root.getBoundingClientRect().left,top:root.getBoundingClientRect().top};move.setPointerCapture(e.pointerId);};
  move.onpointermove=e=>{if(!drag)return;position={x:drag.left+e.clientX-drag.x,y:drag.top+e.clientY-drag.y};clamp();};
  move.onpointerup=()=>{drag=null;remember();if(prefs.rememberPosition&&position){prefs.x=position.x;prefs.y=position.y;void savePreferences();}};
  move.onkeydown=e=>{const directions={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};if(directions[e.key]){e.preventDefault();const rect=root.getBoundingClientRect();position={x:rect.left+directions[e.key][0],y:rect.top+directions[e.key][1]};clamp();remember();}};
  controls.append(move);
  const select=el('select',null,{'aria-label':'Select agent'});data.agents.forEach(a=>{const o=el('option',a.name,{value:a.id});o.selected=a.id===selected;select.append(o);});select.disabled=busy;select.onchange=()=>{selected=select.value;notice='';context=null;remember();render();};controls.append(select,button('−',()=>{minimised=true;remember();render();},'Minimise'),button('×',()=>{hidden=true;remember();render();},'Hide companion'),button('⚙',()=>{settings=!settings;render();},'Agent preferences'));root.append(controls);
  if(settings){const panel=el('div',null,{class:'pc-panel'});panel.append(el('strong','Agent preferences'));
   const options={enabled:'Enable companion',bubble:'Show feedback',command:'Show command bar',animation:'Animate character',reducedMotion:'Reduce motion',rememberPosition:'Remember position',startMinimised:'Start minimised',notifications:'Show task updates'};
   Object.entries(options).forEach(([key,label])=>{const row=el('label',label);const input=el('input',null,{type:'checkbox'});input.checked=prefs[key];input.onchange=()=>{prefs[key]=input.checked;};row.prepend(input);panel.append(row);});
   const size=el('select',null,{'aria-label':'Character size'});['small','medium','large'].forEach(v=>{const o=el('option',v,{value:v});o.selected=prefs.size===v;size.append(o);});size.onchange=()=>prefs.size=size.value;
   panel.append(size,button('Use selected agent by default',()=>{prefs.defaultAgent=selected;void savePreferences();}),button('Save preferences',()=>{if(!prefs.enabled)hidden=true;void savePreferences();}));root.append(panel);
  }
  if(prefs.bubble){const bubble=el('div',null,{class:'pc-panel pc-bubble',role:'status'});bubble.append(el('strong',active.name+' · '+active.state));bubble.append(el('p',notice||active.dialogue.at(-1)?.text||'Ready to chat. Opening the character does not activate tools.'));root.append(bubble);}
  const figure=button('',()=>{expanded=!expanded;render();},'Expand conversation with '+active.name);figure.className='pc-character pc-'+prefs.size;
  const img=el('img',null,{alt:active.name,width:'256',height:'256',decoding:'async',loading:'lazy'});
  const animated=prefs.animation&&!prefs.reducedMotion&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&!document.hidden;
  const pose=busy?'thinking':active.state==='Completed'?'success':active.state==='Working'?'thinking':'idle';img.src='/agents/'+active.id+'/'+(animated&&pose!=='idle'?pose+'.webp':'still.png');img.onerror=()=>{img.onerror=null;img.src='/agents/'+active.id+'/still.png';};
  const art=el('span',null,{class:'plexa-eye-art','data-awake':'true','data-motion':String(animated),'data-reacting':String(pose!=='idle')});art.append(img);
  const eyes=eyeData[active.id];if(eyes){const ns='http://www.w3.org/2000/svg';const svg=document.createElementNS(ns,'svg');svg.setAttribute('class','plexa-eyelids');svg.setAttribute('viewBox','0 0 256 '+eyes.height);svg.setAttribute('aria-hidden','true');eyes.eyes.forEach(([x,y,w,h])=>{const rect=document.createElementNS(ns,'rect');Object.entries({x:x-1,y:y-1,width:w+2,height:h+2,rx:2,fill:eyes.skin}).forEach(([k,v])=>rect.setAttribute(k,v));const line=document.createElementNS(ns,'path');Object.entries({d:`M ${x} ${y+h*.6} q ${w/2} 3 ${w} 0`,stroke:'#30251c','stroke-width':3,fill:'none','stroke-linecap':'round'}).forEach(([k,v])=>line.setAttribute(k,v));svg.append(rect,line);});art.append(svg);}
  figure.onpointerenter=figure.onfocus=()=>{if(animated&&!busy){art.dataset.reacting='true';img.src='/agents/'+active.id+'/hover.webp';}};figure.onpointerleave=figure.onblur=()=>{art.dataset.reacting=String(pose!=='idle');img.src='/agents/'+active.id+'/'+(animated&&pose!=='idle'?pose+'.webp':'still.png');};figure.append(art);root.append(figure);
  if(prefs.command){const form=el('form',null,{class:'pc-command'});const text=el('input',null,{placeholder:'Message '+active.name,'aria-label':'Message '+active.name,maxlength:'2000',required:''});text.value=drafts[selected]||'';text.oninput=()=>{drafts[selected]=text.value;};text.disabled=busy;
   const send=el('button',busy?'…':'↑',{type:'submit','aria-label':'Send message'});send.disabled=busy;form.append(text,send);
   form.onsubmit=async e=>{e.preventDefault();const note=text.value.trim();if(!note||busy)return;busy=true;notice='Waiting for an AI reply…';render();try{const projectId=location.pathname==='/workspace/studio'?new URLSearchParams(location.search).get('project'):null;const next=await request({action:'talk',agentId:selected,version:data.version,note,...(projectId?{projectId}:{})});data={...data,...next};context=next.context;drafts[selected]='';notice='';expanded=true;}catch(error){if(error.result?.agents)data={...data,...error.result};if(error.result?.messageSaved)drafts[selected]='';notice=error.message;}finally{busy=false;render();}};root.append(form);
  }
  root.append(button(expanded?'Close history':'History & tasks',()=>{expanded=!expanded;render();}));
  if(expanded){const panel=el('div',null,{class:'pc-panel pc-history'});panel.append(el('small',data.openaiConfigured?'OpenAI configured · tools are not activated by chat':'OpenAI connection unavailable'));
   panel.append(el('strong','Saved responsibility'),el('p',active.responsibility));
   active.dialogue.forEach(line=>{const p=el('p');p.append(el('strong',line.from==='agent'?active.name:'You'),el('span',line.text));panel.append(p);});
   panel.append(el('strong','Approved learning'));(active.lessons||[]).forEach(l=>panel.append(el('p',l.category+': '+l.solution)));panel.append(el('strong','Saved tasks'));data.tasks.filter(t=>t.owner===selected).forEach(t=>panel.append(el('p',t.title+' · '+t.state)));
   if(data.role==='admin'){data.requests.filter(r=>r.agentId===selected).forEach(r=>panel.append(el('p','Approval request: '+r.reason)));panel.append(el('a','Manage agents & approvals',{href:'/admin/agents'}));}
   if(context)panel.append(el('p','Verified project: '+context.title+' · '+context.status));panel.append(el('small',data.learningStatus),button('Refresh saved status',()=>void refresh()));root.append(panel);
  }clamp();
 }
 new ResizeObserver(()=>clamp()).observe(root);
 window.plexaCompanion={open:async id=>{if(busy)return;if(!data)await refresh();if(!data?.agents.length)return;if(data?.agents.some(a=>a.id===id))selected=id;hidden=false;minimised=false;remember();render();}};
 window.addEventListener('plexa:agent-open',e=>window.plexaCompanion.open(e.detail?.id));
 window.addEventListener('plexa:agent-close',e=>{if(!e.detail?.id||e.detail.id===selected){hidden=true;minimised=false;expanded=false;remember();render();}});
 window.addEventListener('plexa:agent-state-request',()=>render());
 window.addEventListener('plexa:route',()=>void refresh());window.addEventListener('resize',clamp);window.visualViewport?.addEventListener('resize',clamp);window.visualViewport?.addEventListener('scroll',clamp);document.addEventListener('visibilitychange',()=>{if(document.hidden)render();else void refresh();});
 request().then(next=>{if(prefs?.notifications&&data){const changed=next.tasks.find(t=>data.tasks.some(old=>old.id===t.id&&old.state!==t.state));if(changed)notice=changed.title+' · '+changed.state;}data=next;prefs=next.preferences;selected=prefs.defaultAgent;if(!agent())selected=next.agents[0]?.id;hidden=!prefs.enabled;minimised=prefs.startMinimised;try{const saved=JSON.parse(sessionStorage.getItem('plexa-companion:'+data.userId)||'null');if(saved){if(next.agents.some(a=>a.id===saved.selected))selected=saved.selected;hidden=!prefs.enabled||saved.hidden;minimised=saved.minimised;if(prefs.rememberPosition)position=saved.position;}}catch{}if(!position&&prefs.rememberPosition&&prefs.x+prefs.y>0)position={x:prefs.x,y:prefs.y};render();}).catch(()=>root.replaceChildren());
})();
