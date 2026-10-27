import {expect,it} from 'vitest';
import {elevenLabsCaptionCues} from './elevenlabs-caption-timing';
it('uses returned speech timing and accounts for playback speed',()=>{
 const text='Sam speaks. A second phrase.';
 const a={characters:[...text],character_start_times_seconds:[...text].map((_,i)=>i*.1),character_end_times_seconds:[...text].map((_,i)=>(i+1)*.1)};
 const cues=elevenLabsCaptionCues(a,2);
 expect(cues[0]).toEqual({text:'Sam speaks.',startSec:0,endSec:.55});
 expect(cues[1].startSec).toBeCloseTo(.6);
 expect(cues.map(c=>c.text).join(' ')).toBe(text);
 expect(()=>elevenLabsCaptionCues({...a,character_end_times_seconds:[]},1)).toThrow();
});
