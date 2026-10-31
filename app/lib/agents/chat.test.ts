import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
vi.mock('@/app/lib/server-secrets',()=>({getServerSecretAsync:vi.fn().mockResolvedValue('test-key'),readStoredSettingsAsync:vi.fn().mockResolvedValue({})}));
vi.mock('./store',()=>({readAgents:vi.fn(),updateAgents:vi.fn()}));
import {readAgents,updateAgents} from './store';
import {initialData} from './model';
import {agentChat} from './chat';
const task={owner:'bob',title:'Prepare clip',source:'Admin chat request',brand:'Football365',workspace:'Pilot',priority:'Normal'};
describe('Agent proposals',()=>{
 beforeEach(()=>{vi.clearAllMocks();const data=initialData();Object.assign(data.agents[0],{brand:'Football365',workspace:'Pilot'});vi.mocked(readAgents).mockResolvedValue(data);});
 afterEach(()=>vi.unstubAllGlobals());
 function reply(args:unknown,name='propose_task'){vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({choices:[{message:{tool_calls:[{function:{name,arguments:JSON.stringify(args)}}]}}]})));}
 it('returns a validated proposal without writing or executing',async()=>{reply(task);const result=await agentChat('Prepare a task','bob',{});expect(result.response.proposal?.command).toEqual({...task,action:'task'});expect(updateAgents).not.toHaveBeenCalled();});
 it('rejects unknown tools',async()=>{reply(task,'shell');await expect(agentChat('Run it','bob',{})).rejects.toThrow('Unsupported');expect(updateAgents).not.toHaveBeenCalled();});
 it('rejects another workspace',async()=>{reply({...task,workspace:'Other'});await expect(agentChat('Run it','bob',{})).rejects.toThrow('Configure');});
 it('rejects tasks for another agent',async()=>{reply({...task,owner:'fiddle'});await expect(agentChat('Run it','bob',{})).rejects.toThrow('outside');});
 it('rejects unknown agent before calling OpenAI',async()=>{reply(task);await expect(agentChat('hi','unknown',{})).rejects.toThrow('Unknown');expect(fetch).not.toHaveBeenCalled();});
});
