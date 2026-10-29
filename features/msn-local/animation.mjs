// Scene-relative motion shared by the editor and renderer. Values are schema-validated before export.
export const motionChoices={entrance:['none','fade','slide-left','slide-right','slide-up','slide-down'],continuous:['none','float','pan'],exit:['none','fade','slide-left','slide-right','slide-up','slide-down']};
export function timing(a,phase,length){const delay=Math.min(a.delay||0,Math.max(0,length-.01));const duration=Math.min(a.duration||1,Math.max(.01,length-delay));return {start:phase==='exit'?length-delay-duration:delay,duration};}
export function sampleMotion(animation,t,length){let x=0,y=0,opacity=1;for(const phase of Object.keys(motionChoices)){const a=animation?.[phase];if(!a||a.effect==='none')continue;const {start,duration}=timing(a,phase,length),p=Math.max(0,Math.min(1,(t-start)/duration)),amount=(a.intensity??35)*2;
if(phase==='continuous'){const clock=a.loop===false?Math.min(duration,Math.max(0,t-start)):Math.max(0,t-start);const offset=Math.sin(clock/duration*Math.PI*2)*amount;if(a.effect==='float')y+=offset;else x+=offset;continue;}
if(phase==='entrance'&&t<start)opacity=0;
if(a.effect==='fade'){opacity*=phase==='entrance'?p:1-p;continue;}
const offset=amount*(phase==='entrance'?1-p:p),sign=a.effect==='slide-left'||a.effect==='slide-up'?-1:1;if(a.effect==='slide-up'||a.effect==='slide-down')y+=sign*offset;else x+=sign*offset;
if(phase==='exit'&&t>=start+duration)opacity=0;
}return{x,y,opacity};}
export function motionFilters(animation,length){const xs=['0'],ys=['0'],filters=['format=rgba'],gates=[];for(const phase of Object.keys(motionChoices)){const a=animation?.[phase];if(!a||a.effect==='none')continue;const {start,duration}=timing(a,phase,length),amount=(a.intensity??35)*2;
if(phase==='continuous'){const clock=a.loop===false?`min(${duration},max(0,t-${start}))`:`max(0,t-${start})`;const expr=`${amount}*sin((${clock})/${duration}*2*PI)`;(a.effect==='float'?ys:xs).push(expr);continue;}
if(a.effect==='fade'){filters.push(`fade=t=${phase==='entrance'?'in':'out'}:st=${start}:d=${duration}:alpha=1`);continue;}
const p=`clip((t-${start})/${duration},0,1)`,sign=a.effect==='slide-left'||a.effect==='slide-up'?-1:1;const expr=`${sign*amount}*(${phase==='entrance'?'1-':''}${p})`;(a.effect==='slide-up'||a.effect==='slide-down'?ys:xs).push(expr);
if(phase==='entrance')gates.push(`gte(t,${start})`);else gates.push(`lt(t,${start+duration})`);
}return {filters:filters.join(','),x:xs.join('+'),y:ys.join('+'),enable:gates.join('*')||'1'};}
