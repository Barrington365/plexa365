import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('@/app/lib/auth/guards',()=>({requireAdmin:vi.fn()}));
vi.mock('@/app/lib/profiles/directory',()=>({profileDirectory:vi.fn()}));
vi.mock('@/app/lib/studio-workspace/store',()=>({hostedWorkspace:vi.fn()}));
import {requireAdmin} from '@/app/lib/auth/guards';
import {profileDirectory} from '@/app/lib/profiles/directory';
import {hostedWorkspace} from '@/app/lib/studio-workspace/store';
import type {ProfileSettings} from '@/app/lib/profiles/model';
import {GET,PATCH} from './route';
const payload={id:'presenter:daniel-brooks',bio:'Fictional presenter',voiceId:'sam',voiceUseApproved:true,assets:['uploads/idle.mp4'],expectedRevision:0};
const request=(body:unknown=payload,origin='https://studio.test')=>new Request('https://studio.test/api/admin/profiles',{method:'PATCH',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
describe('profile access and persistence',()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.mocked(requireAdmin).mockResolvedValue({user:{id:'admin'} as never});vi.mocked(profileDirectory).mockResolvedValue({profiles:[{...payload}],voices:[{id:'sam',name:'Sam'}],media:[{asset:'uploads/idle.mp4'}]} as never);});
 it('denies reads and writes before accessing profiles for non-admins',async()=>{vi.mocked(requireAdmin).mockResolvedValue({response:new Response(null,{status:403})});expect((await GET(request())).status).toBe(403);expect((await PATCH(request())).status).toBe(403);expect(profileDirectory).not.toHaveBeenCalled();});
 it('rejects cross-origin writes',async()=>{expect((await PATCH(request(payload,'https://other.test'))).status).toBe(403);expect(hostedWorkspace).not.toHaveBeenCalled();});
 it('cannot alter authentication permissions through profiles',async()=>{expect((await PATCH(request({...payload,role:'admin',active:true}))).status).toBe(400);expect(hostedWorkspace).not.toHaveBeenCalled();});
 it('rejects unknown voices and media before writing',async()=>{expect((await PATCH(request({...payload,voiceId:'unknown'}))).status).toBe(409);expect((await PATCH(request({...payload,assets:['outside/file']}))).status).toBe(409);expect(hostedWorkspace).not.toHaveBeenCalled();});
 it('preserves unrelated workspace data and rejects stale edits',async()=>{const state:{projects:{id:string}[];identityProfiles?:Record<string,ProfileSettings>;profileHistory?:unknown[]}={projects:[{id:'existing'}]};vi.mocked(hostedWorkspace).mockReturnValue({update:async(fn:(state:unknown)=>unknown)=>fn(state)} as never);expect((await PATCH(request())).status).toBe(200);expect(state.projects).toEqual([{id:'existing'}]);expect(state.identityProfiles![payload.id]).toMatchObject({voiceId:'sam',assets:payload.assets,revision:1,updatedBy:'admin'});expect(state.profileHistory).toHaveLength(1);expect((await PATCH(request())).status).toBe(409);expect(state.identityProfiles![payload.id].revision).toBe(1);});
});
