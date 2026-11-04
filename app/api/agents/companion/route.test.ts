import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('@/app/lib/auth/guards',()=>({requireUser:vi.fn()}));
vi.mock('@/app/lib/auth/store',()=>({saveCompanionPreferences:vi.fn()}));
vi.mock('@/app/lib/agents/store',()=>({readAgents:vi.fn(),updateAgents:vi.fn(),Conflict:class extends Error{}}));
vi.mock('@/app/lib/ai/client',()=>({aiChatText:vi.fn()}));
vi.mock('@/app/lib/ai/config',()=>({loadAiProviderConfig:vi.fn()}));
vi.mock('@/app/lib/studio-workspace/store',()=>({hostedWorkspace:vi.fn()}));
import {requireUser} from '@/app/lib/auth/guards';
import {readAgents,updateAgents} from '@/app/lib/agents/store';
import {aiChatText} from '@/app/lib/ai/client';
import {loadAiProviderConfig} from '@/app/lib/ai/config';
import {hostedWorkspace} from '@/app/lib/studio-workspace/store';
import {initialData,applyCommand} from '@/app/lib/agents/model';
import {GET,POST} from './route';
const request=(body:unknown,origin='https://plexa.test')=>new Request('https://plexa.test/api/agents/companion',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
const talk={action:'talk',agentId:'bob',version:0,note:'What can you do?'};
describe('companion API',()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.mocked(requireUser).mockResolvedValue({user:{id:'u',active:true,emailVerifiedAt:'now',role:'admin'} as never});vi.mocked(readAgents).mockResolvedValue(initialData());vi.mocked(loadAiProviderConfig).mockResolvedValue({openaiConfigured:true} as never);});
 it('requires sign-in',async()=>{vi.mocked(requireUser).mockResolvedValue({response:new Response(null,{status:401})});expect((await GET(new Request('https://plexa.test'))).status).toBe(401);expect(readAgents).not.toHaveBeenCalled();});
 it('rejects cross-origin requests before changing records',async()=>{expect((await POST(request(talk,'https://evil.test'))).status).toBe(403);expect(updateAgents).not.toHaveBeenCalled();});
 it('does not offer execution commands',async()=>{expect((await POST(request({...talk,action:'activate'}))).status).toBe(400);expect(updateAgents).not.toHaveBeenCalled();});
 it('rejects editors without an assigned scope',async()=>{vi.mocked(requireUser).mockResolvedValue({user:{id:'e',active:true,emailVerifiedAt:'now',role:'editor'} as never});expect((await POST(request(talk))).status).toBe(403);expect(aiChatText).not.toHaveBeenCalled();});
 it('does not fall back to another provider when OpenAI is absent',async()=>{vi.mocked(loadAiProviderConfig).mockResolvedValue({openaiConfigured:false} as never);expect((await POST(request(talk))).status).toBe(503);expect(updateAgents).not.toHaveBeenCalled();expect(aiChatText).not.toHaveBeenCalled();});
 it('rejects missing selected projects before sending',async()=>{vi.mocked(hostedWorkspace).mockReturnValue({projects:{get:async()=>null}} as never);expect((await POST(request({...talk,projectId:'missing'}))).status).toBe(400);expect(aiChatText).not.toHaveBeenCalled();});
 it('persists conversation through existing store without activating tools',async()=>{const d=initialData();vi.mocked(updateAgents).mockImplementation(async(c,v,u)=>applyCommand({...d,version:v},c,u,'now','event'));vi.mocked(aiChatText).mockResolvedValue({text:'I can discuss your draft.',provider:'openai'} as never);const response=await POST(request(talk));expect(response.status).toBe(200);const body=await response.json();expect(body.agents.every((a:{state:string})=>a.state==='Paused')).toBe(true);expect(body.tasks).toEqual([]);expect(vi.mocked(updateAgents).mock.calls.map(c=>c[0].action)).toEqual(['talk','reply']);});
 it('rejects role revocation during data loading',async()=>{
  vi.mocked(requireUser).mockResolvedValueOnce({user:{id:'u',role:'admin',active:true,emailVerifiedAt:'now'} as never}).mockResolvedValue({user:{id:'u',role:'viewer',active:true,emailVerifiedAt:'now'} as never});
  expect((await GET(new Request('https://plexa.test'))).status).toBe(403);
 });
 it('rejects role revocation before dispatching chat',async()=>{
  vi.mocked(requireUser).mockResolvedValueOnce({user:{id:'u',role:'admin',active:true,emailVerifiedAt:'now'} as never}).mockResolvedValue({user:{id:'u',role:'viewer',active:true,emailVerifiedAt:'now'} as never});
  expect((await POST(request(talk))).status).toBe(403);expect(updateAgents).not.toHaveBeenCalled();expect(aiChatText).not.toHaveBeenCalled();
 });
 it('reports provider failures without pretending a response exists',async()=>{vi.mocked(updateAgents).mockResolvedValue(initialData());vi.mocked(aiChatText).mockRejectedValue(Error('provider offline'));const response=await POST(request(talk));expect(response.status).toBe(502);expect((await response.json()).messageSaved).toBe(true);expect(updateAgents).toHaveBeenCalledTimes(1);});
});

it('denies viewers both reads and writes even with a valid session',async()=>{vi.clearAllMocks();vi.mocked(requireUser).mockResolvedValue({user:{id:'v',active:true,emailVerifiedAt:'now',role:'viewer'} as never});expect((await GET(new Request('https://plexa.test'))).status).toBe(403);expect((await POST(request(talk))).status).toBe(403);expect(aiChatText).not.toHaveBeenCalled();});
