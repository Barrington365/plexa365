import {describe,it,expect} from 'vitest';
import {initialData,applyCommand} from './model';
import {companionData,verifiedProject,preferencesSchema,defaultPreferences} from './companion';
import type {PlexaUser} from '@/app/lib/auth/types';
const user={id:'editor',active:true,emailVerifiedAt:'2026-01-01',role:'editor',agentScopes:[{brand:'TEAMtalk',workspace:'pilot'}]} as PlexaUser;
function fixture(){const d=initialData();d.agents.forEach(a=>{a.brand='TEAMtalk';a.workspace='pilot';});return d;}
describe('companion access and reuse',()=>{
 it('admin sees eight original agents; editor only assigned Bob and Fiddle',()=>{const d=fixture();expect(companionData(d,{...user,role:'admin'}).agents).toHaveLength(8);expect(companionData(d,user).agents.map(a=>a.id)).toEqual(['bob','fiddle']);expect(companionData(d,{...user,agentScopes:[]}).agents).toHaveLength(0);expect(companionData(d,{...user,role:'viewer'}).agents).toHaveLength(0);});
 it('does not expose old admin conversations or other users to editors',()=>{let d=fixture();d.agents[0].dialogue=[{at:'now',from:'admin',text:'Private admin message'}];d=applyCommand(d,{action:'talk',agentId:'bob',note:'My draft'},user.id,'now','1');expect(companionData(d,user).agents[0].dialogue.map(l=>l.text)).toEqual(['My draft']);expect(companionData(d,{...user,id:'someone-else'}).agents[0].dialogue).toEqual([]);expect(d.agents[0].state).toBe('Paused');expect(d.tasks).toHaveLength(0);});
 it('rejects a browser-selected project outside the saved scope',()=>{const a=fixture().agents[0];expect(()=>verifiedProject({id:'p',brand:'F365',workspace:'pilot'},user,a)).toThrow();expect(()=>verifiedProject({id:'p'},user,a)).toThrow();expect(verifiedProject({id:'p',brand:'TEAMtalk',workspace:'pilot',title:'Draft'},user,a).projectId).toBe('p');expect(()=>verifiedProject(null,{...user,role:'admin'},a)).toThrow();});
 it('validates preferences without accepting permission or activation controls',()=>{expect(preferencesSchema.safeParse({...defaultPreferences,x:-5}).success).toBe(false);expect(preferencesSchema.parse({...defaultPreferences,activate:true})).not.toHaveProperty('activate');});
});
import {approvedLessons} from './companion';
it('retrieves existing approved lessons with exact project and agent boundaries',()=>{
 const d=fixture();const l={id:'l',agentId:'bob',brand:'TEAMtalk',workspace:'pilot',project:'p',scope:'project',category:'Lessons Learned',observation:'Check',solution:'Verify alpha',status:'Approved',approvedBy:'admin'};
 Object.assign(d,{lessons:[l,{...l,id:'unapproved',approvedBy:undefined},{...l,id:'foreign',brand:'F365'}]});
 expect(approvedLessons(d,d.agents[0],'p').map(l=>l.id)).toEqual(['l']);expect(approvedLessons(d,d.agents[0],'other')).toEqual([]);
});

import {visibleDialogue} from './companion';
it('direct dialogue reads reject inactive, unverified and revoked users',()=>{
 const agent=fixture().agents[0];agent.dialogue=[{at:'now',from:'admin',text:'Private'}];
 for(const patch of [{active:false,role:'admin'},{emailVerifiedAt:null,role:'admin'},{role:'viewer'}]){
 expect(visibleDialogue(agent,{...user,...patch} as PlexaUser)).toEqual([]);
 }
});

it('projects mixed records without leaking admin requests, foreign tasks or inactive account data',()=>{
 const d=fixture();
 Object.assign(d.agents[0],{state:'Active',approved:true});
 d.agents[0].dialogue=[{at:'now',from:'agent',text:'Own reply',userId:user.id,brand:'TEAMtalk',workspace:'pilot'}];
 const t={id:'working',owner:'bob',brand:'TEAMtalk',workspace:'pilot',title:'Approved draft',source:'test',priority:'Normal',state:'Working' as const,createdAt:'now',updatedAt:'now',messages:[],runId:'run',leaseUntil:new Date(Date.now()+60000).toISOString()};
 d.tasks=[t,{...t,id:'foreign',workspace:'other'}];
 d.requests=[{id:'waiting',agentId:'bob',reason:'Admin only',state:'Waiting for Admin',createdAt:'now'},{id:'closed',agentId:'bob',reason:'Closed',state:'Completed',createdAt:'now'}];
 const before=JSON.stringify(d);
 const editor=companionData(d,user);
 expect(editor.agents.map(a=>a.id)).toEqual(['bob','fiddle']);
 expect(editor.agents[0].working?.title).toBe('Approved draft');
 expect(editor.tasks.map(t=>t.id)).toEqual(['working']);
 expect(editor.requests).toEqual([]);
 expect(companionData(d,{...user,role:'admin'}).requests.map(r=>r.id)).toEqual(['waiting']);
 for(const patch of [{active:false},{emailVerifiedAt:null}]){
 const disabled={...user,role:'admin',...patch} as PlexaUser;
 const result=companionData(d,disabled);
 expect(result.agents).toEqual([]);
 expect(result.tasks).toEqual([]);
 expect(result.requests).toEqual([]);
 expect(visibleDialogue(d.agents[0],disabled)).toEqual([]);
 }
 expect(JSON.stringify(d)).toBe(before);
});
