/** Portable editorial brief. Never treat Markdown headings or notes as spoken text. */
export const briefTags=['curious','thoughtful','calm','short pause','slowly','softly'];
export function validateBrief(input){
 const b=structuredClone(input);for(const [key,max]of [['script',4500],['direction',6000],['pronunciation',6000],['source',10000]])if(typeof b[key]!=='string'||b[key].length>max)throw Error('Invalid narration brief '+key);
 b.script=b.script.trim();if(!b.script||/[\[\]<>]/.test(b.script))throw Error('Keep spoken script free of headings, markup and delivery tags');
 const paragraphs=b.script.split(/\n\s*\n/);if(!Array.isArray(b.performance)||b.performance.length!==paragraphs.length)throw Error('Review one performance row per script paragraph');
 b.performance=b.performance.map((r,i)=>{if(r.text!==paragraphs[i]||typeof r.direction!=='string'||r.direction.length>2000||!Array.isArray(r.tags)||r.tags.length>2||r.tags.some(t=>!briefTags.includes(t)))throw Error('Performance map must match the exact script and use supported tags');return {text:r.text,direction:r.direction,tags:r.tags};});
 if(!Number.isFinite(b.tempo)||b.tempo<.5||b.tempo>2)throw Error('Choose tempo between 0.5 and 2');
 return {script:b.script,direction:b.direction,pronunciation:b.pronunciation,source:b.source,performance:b.performance,tempo:b.tempo};
}
export function parseNarrationBrief(markdown){
 if(typeof markdown!=='string'||markdown.length>100000)throw Error('Choose a Markdown brief under 100,000 characters');
 const sections=new Map();let heading='',lines=[];function flush(){if(heading){if(sections.has(heading))throw Error('Duplicate brief section: '+heading);sections.set(heading,lines.join('\n').trim());}}
 let fenced=false;for(const line of markdown.replace(/\r\n/g,'\n').split('\n')){if(/^```/.test(line))fenced=!fenced;const match=!fenced&&line.match(/^##\s+(.+)$/);if(match){flush();heading=match[1].split(/\s+[—–]\s+/)[0].trim().toLowerCase();lines=[];}else lines.push(line);}flush();
 const section=sections.get('spoken script')||'',blocks=[...section.matchAll(/```(?:text)?\s*\n([\s\S]*?)```/g)];if(blocks.length!==1)throw Error('Include exactly one fenced text block in the Spoken script section');const script=blocks[0][1].trim();
 const rows=(sections.get('performance map')||'').split('\n').filter(l=>/^\|\s*\d+\s*\|/.test(l)).map(l=>l.split('|').slice(1,-1).map(v=>v.trim()));
 const performance=script.split(/\n\s*\n/).map((text,i)=>{const row=rows.find(r=>Number(r[0])===i+1),direction=row?row.slice(1).join(' · '):'';return {text,direction,tags:/curiosity|curious|question/.test(direction.toLowerCase())?['curious']:/pause after/.test(direction.toLowerCase())?['short pause']:[]};});
 return validateBrief({script,direction:sections.get('voice direction')||'',pronunciation:sections.get('pronunciation and text handling')||'',source:sections.get('source record')||'',performance,tempo:1});
}
export function briefSpeech(brief,variant){const b=validateBrief(brief);if(!['plain','directed'].includes(variant))throw Error('Choose plain or directed narration');return variant==='plain'?b.script:b.performance.map(r=>{const before=r.tags.filter(t=>t!=='short pause');return (before.length?before.map(t=>'['+t+']').join(' ')+' ':'')+r.text+(r.tags.includes('short pause')?' [short pause]':'');}).join('\n\n');}
/** Replace display-only brand wording while retaining the exact spoken alignment elsewhere. */
export function brandCaptionAlignment(script,a){let text='',characters=[],starts=[],ends=[],cursor=0;const copy=(from,to)=>{text+=script.slice(from,to);characters.push(...a.characters.slice(from,to));starts.push(...a.character_start_times_seconds.slice(from,to));ends.push(...a.character_end_times_seconds.slice(from,to));};for(const m of script.matchAll(/Football three sixty[- ]five(?: dot com)?/gi)){copy(cursor,m.index);const replacement=/dot com/i.test(m[0])?'Football365.com':'Football365',start=a.character_start_times_seconds[m.index],end=a.character_end_times_seconds[m.index+m[0].length-1];text+=replacement;for(let i=0;i<replacement.length;i++){characters.push(replacement[i]);starts.push(start+(end-start)*i/replacement.length);ends.push(start+(end-start)*(i+1)/replacement.length);}cursor=m.index+m[0].length;}copy(cursor,script.length);return {script:text,alignment:{characters,character_start_times_seconds:starts,character_end_times_seconds:ends}};}
