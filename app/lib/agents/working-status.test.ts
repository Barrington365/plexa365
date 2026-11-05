import {describe,it,expect} from 'vitest';
import {workingTask} from './working-status';
const now=Date.parse('2026-11-05T12:00:00Z');
const agent={id:'bob',state:'Active',approved:true,brand:'TEAMtalk',workspace:'pilot'};
const task={id:'t',owner:'bob',state:'Working',brand:'TEAMtalk',workspace:'pilot',title:'Draft video',runId:'run',leaseUntil:new Date(now+120000).toISOString()};
describe('confirmed working animation',()=>{
 it.each(['bob','fiddle','james','hubble','linnaeus','banach','halley','huygens'])('supports %s without activating it',id=>{expect(workingTask({...agent,id},[{...task,owner:id}],now)?.id).toBe('t');expect(workingTask({...agent,id,state:'Paused'},[{...task,owner:id}],now)).toBeNull();});
 it.each(['Queued','Paused','Completed','Cancelled','Failed','Waiting for Admin','Waiting for Input'])('never treats %s as working',state=>expect(workingTask(agent,[{...task,state}],now)).toBeNull());
 it('fails closed on stale leases, missing worker, revoked approval and another scope',()=>{
 for(const patch of [{leaseUntil:new Date(now).toISOString()},{leaseUntil:'invalid'},{leaseUntil:undefined},{runId:undefined},{owner:'fiddle'},{brand:'Other'},{workspace:'Other'}])expect(workingTask(agent,[{...task,...patch}],now)).toBeNull();
 expect(workingTask({...agent,approved:false},[task],now)).toBeNull();
 });
 it('does not mistake an open companion or chat for execution',()=>expect(workingTask(agent,[],now)).toBeNull());
});
