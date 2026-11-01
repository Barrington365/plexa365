import {beforeEach,describe,it,expect,vi} from 'vitest';
const mock=vi.hoisted(()=>({user:vi.fn(),admin:vi.fn(),inventory:vi.fn(),check:vi.fn()}));
vi.mock('@/app/lib/auth/guards',()=>({requireUser:mock.user,requireAdmin:mock.admin}));
vi.mock('@/app/lib/plugins/service',()=>({inventory:mock.inventory,safeCheck:mock.check}));
import {GET,POST} from './route';
beforeEach(()=>{vi.clearAllMocks();mock.user.mockResolvedValue({user:{role:'editor'}});mock.admin.mockResolvedValue({response:Response.json({error:'Admin required'},{status:403})});mock.inventory.mockResolvedValue([]);});
describe('plugin access',()=>{
 it('lets editors read status, not manage providers',async()=>{expect(await (await GET(new Request('http://localhost/api/plugins'))).json()).toEqual({admin:false,plugins:[]});expect((await POST(new Request('http://localhost/api/plugins',{method:'POST'}))).status).toBe(403);expect(mock.check).not.toHaveBeenCalled();});
 it('denies non-workspace roles',async()=>{mock.user.mockResolvedValue({user:{role:'meeting_guest'}});expect((await GET(new Request('http://localhost/api/plugins'))).status).toBe(403);expect(mock.inventory).not.toHaveBeenCalled();});
 it('denies unauthenticated requests',async()=>{mock.user.mockResolvedValue({response:new Response(null,{status:401})});expect((await GET(new Request('http://localhost/api/plugins'))).status).toBe(401);});
 it('requires same origin even for admin',async()=>{mock.admin.mockResolvedValue({user:{role:'admin'}});expect((await POST(new Request('http://localhost/api/plugins',{method:'POST',headers:{Origin:'https://untrusted.invalid'},body:'{"id":"openai"}'}))).status).toBe(403);expect(mock.check).not.toHaveBeenCalled();});
 it('only dispatches registered checks',async()=>{mock.admin.mockResolvedValue({user:{role:'admin'}});const req=(id:string)=>new Request('http://localhost/api/plugins',{method:'POST',headers:{Origin:'http://localhost'},body:JSON.stringify({id})});expect((await POST(req('arbitrary-host'))).status).toBe(404);expect((await POST(req('openai'))).status).toBe(200);expect(mock.check).toHaveBeenCalledTimes(1);});
 it('sanitises storage errors',async()=>{mock.inventory.mockRejectedValue(new Error('sensitive provider data'));const r=await GET(new Request('http://localhost/api/plugins'));expect(r.status).toBe(503);expect(await r.text()).not.toContain('sensitive');});
});

it('allows viewer inventory but rejects checks before contacting providers',async()=>{mock.user.mockResolvedValue({user:{role:'viewer'}});expect((await GET(new Request('http://localhost/api/plugins'))).status).toBe(200);expect((await POST(new Request('http://localhost/api/plugins',{method:'POST'}))).status).toBe(403);expect(mock.check).not.toHaveBeenCalled();});
it('exposes admin management and rejects malformed requests safely',async()=>{mock.user.mockResolvedValue({user:{role:'admin'}});mock.admin.mockResolvedValue({user:{role:'admin'}});expect((await (await GET(new Request('http://localhost/api/plugins'))).json()).admin).toBe(true);expect((await POST(new Request('http://localhost/api/plugins',{method:'POST',headers:{Origin:'http://localhost'},body:'invalid'}))).status).toBe(400);expect(mock.check).not.toHaveBeenCalled();});
