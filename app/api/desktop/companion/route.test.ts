import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('@/app/lib/desktop/sessions',()=>({desktopUser:vi.fn()}));
vi.mock('@/app/api/agents/companion/route',()=>({GET:vi.fn(),POST:vi.fn()}));
import {desktopUser} from '@/app/lib/desktop/sessions';
import {GET as existingGet,POST as existingPost} from '@/app/api/agents/companion/route';
import {verifySessionToken,SESSION_COOKIE} from '@/app/lib/auth/sessions';
import {GET,POST} from './route';
describe('desktop companion adapter',()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.mocked(desktopUser).mockResolvedValue({id:'editor',role:'editor',email:'test@example.test'} as never);vi.mocked(existingGet).mockResolvedValue(Response.json({agents:[]}));vi.mocked(existingPost).mockResolvedValue(Response.json({error:'Not authorised'},{status:403}));});
 it('rejects invalid desktop credentials before the existing handler',async()=>{vi.mocked(desktopUser).mockResolvedValue(null);expect((await GET(new Request('https://plexa.test/api/desktop/companion'))).status).toBe(401);expect(existingGet).not.toHaveBeenCalled();});
 it('uses the verified identity, never a supplied browser cookie',async()=>{const response=await GET(new Request('https://plexa.test/api/desktop/companion',{headers:{cookie:'plexa_session=attacker'}}));const forwarded=vi.mocked(existingGet).mock.calls[0][0];const cookie=forwarded.headers.get('cookie')!;expect(verifySessionToken(cookie.slice(SESSION_COOKIE.length+1))?.role).toBe('editor');expect(cookie).not.toContain('attacker');expect(response.headers.has('set-cookie')).toBe(false);});
 it('preserves existing permission denial on POST',async()=>{const body={action:'activate',agentId:'bob'};const response=await POST(new Request('https://plexa.test/api/desktop/companion',{method:'POST',body:JSON.stringify(body)}));expect(response.status).toBe(403);expect(await vi.mocked(existingPost).mock.calls[0][0].json()).toEqual(body);});
});
