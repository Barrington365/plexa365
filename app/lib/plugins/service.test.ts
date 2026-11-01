import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({secrets:vi.fn(),read:vi.fn(),write:vi.fn(),fetch:vi.fn(),reserve:vi.fn()}));
vi.mock('@/app/lib/server-secrets',()=>({getServerSecretAsync:mocks.secrets}));
vi.mock('@/app/lib/netlify-blob-json',()=>({shouldUseNetlifyBlobStore:()=>true}));
vi.mock('@netlify/blobs',()=>({getStore:()=>({get:mocks.read,setJSON:mocks.write,getWithMetadata:mocks.reserve})}));
import {inventory,safeCheck} from './service';
import {plugins} from './catalog';
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal('fetch',mocks.fetch);mocks.secrets.mockResolvedValue('fixture-not-a-real-key');mocks.read.mockResolvedValue(undefined);mocks.reserve.mockResolvedValue(null);mocks.write.mockResolvedValue({modified:true});mocks.fetch.mockImplementation(async()=>new Response('{}',{status:200,headers:{'Content-Type':'application/json'}}));});
describe('safe provider checks',()=>{
 it('ElevenLabs only lists voices and never generates speech',async()=>{await safeCheck(plugins.find(p=>p.id==='elevenlabs')!);expect(mocks.fetch).toHaveBeenCalledTimes(1);expect(mocks.fetch.mock.calls[0][0]).toBe('https://api.elevenlabs.io/v1/voices');expect(mocks.fetch.mock.calls[0][1]).toMatchObject({method:'GET',redirect:'error',headers:{'xi-api-key':'fixture-not-a-real-key'}});expect(JSON.stringify(mocks.write.mock.calls)).not.toContain('fixture-not-a-real-key');});
 it('keeps credentials and raw provider errors out of inventory',async()=>{const data=await inventory();expect(JSON.stringify(data)).not.toContain('fixture-not-a-real-key');expect(data.find(x=>x.id==='openai')?.status).toBe('Configured — Not Verified');});
 it('does not follow authenticated redirects or accept HTML success pages',async()=>{mocks.fetch.mockResolvedValue(new Response('login',{status:200,headers:{'Content-Type':'text/html'}}));await safeCheck(plugins[0]);expect(mocks.write.mock.calls.at(-1)?.[1].ok).toBe(false);});
 it('sanitises upstream error bodies',async()=>{mocks.fetch.mockResolvedValue(new Response('secret echo fixture-not-a-real-key',{status:401}));await safeCheck(plugins[0]);const stored=mocks.write.mock.calls.at(-1)?.[1];expect(stored.httpStatus).toBe(401);expect(stored.error).not.toContain('fixture-not-a-real-key');});
 it('rejects missing credentials without making requests',async()=>{mocks.secrets.mockResolvedValue(undefined);await expect(safeCheck(plugins[0])).rejects.toThrow();expect(mocks.fetch).not.toHaveBeenCalled();});
 it('prevents concurrent checks across workers',async()=>{mocks.write.mockResolvedValue({modified:false});await expect(safeCheck(plugins[0])).rejects.toThrow('already running');expect(mocks.fetch).not.toHaveBeenCalled();});
 it('bounds repeated checks',async()=>{mocks.read.mockResolvedValue({checkedAt:new Date().toISOString()});await expect(safeCheck(plugins[0])).rejects.toThrow('30 seconds');expect(mocks.fetch).not.toHaveBeenCalled();});
 it('recovers from expired leases',async()=>{mocks.reserve.mockResolvedValue({data:{started:Date.now()-31000},etag:'previous'});await safeCheck(plugins[0]);expect(mocks.write.mock.calls[0][2]).toEqual({onlyIfMatch:'previous'});expect(mocks.fetch).toHaveBeenCalledOnce();});
});
