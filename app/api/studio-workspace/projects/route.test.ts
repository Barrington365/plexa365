import {beforeEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({role:'editor',authorized:true,list:vi.fn(),save:vi.fn(),create:vi.fn()}));
vi.mock('@/app/lib/auth/guards',()=>({requireUser:async()=>state.authorized?{user:{role:state.role}}:{response:new Response('{}',{status:401})}}));
vi.mock('@/app/lib/studio-workspace/store',()=>({hostedWorkspace:()=>({projects:{list:state.list,listTemplates:async()=>[],save:state.save,create:state.create}})}));
import {GET,POST} from './route';
const request=(body:object,origin='https://planetsport.studio')=>new Request('https://planetsport.studio/api/studio-workspace/projects',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
describe('hosted Studio projects boundary',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.role='editor';state.authorized=true;state.list.mockResolvedValue([]);state.save.mockResolvedValue({id:'project',updatedAt:'2026-10-29T12:00:00.000Z'});});
 it('requires verified user for project listing',async()=>{state.authorized=false;expect((await GET(new Request('https://planetsport.studio/api/studio-workspace/projects'))).status).toBe(401);expect(state.list).not.toHaveBeenCalled();});
 it('viewers cannot modify drafts',async()=>{state.role='viewer';expect((await POST(request({action:'save'}))).status).toBe(403);expect(state.save).not.toHaveBeenCalled();});
 it('rejects cross-origin mutations',async()=>{expect((await POST(request({action:'save'},'https://other.example'))).status).toBe(403);expect(state.save).not.toHaveBeenCalled();});
 it('requires the saved revision and returns conflicts without pretending success',async()=>{expect((await POST(request({action:'save',id:'project',patch:{title:'Edit'}}))).status).toBe(400);state.save.mockRejectedValue(Error('Project changed'));expect((await POST(request({action:'save',id:'project',expectedUpdatedAt:'prior',patch:{title:'Edit'}}))).status).toBe(409);});
 it('read failures are unavailable rather than an empty library',async()=>{state.list.mockRejectedValue(Error('storage offline'));const response=await GET(new Request('https://planetsport.studio/api/studio-workspace/projects'));expect(response.status).toBe(503);expect(await response.json()).not.toHaveProperty('projects');});
});
