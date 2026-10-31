import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('@/app/lib/auth/guards',()=>({requireAdmin:vi.fn()}));
vi.mock('@/app/lib/agents/chat',()=>({agentChat:vi.fn()}));
vi.mock('@/app/lib/dev-gateway/context',()=>({buildDevGatewayContext:vi.fn().mockResolvedValue({})}));
import {requireAdmin} from '@/app/lib/auth/guards';
import {agentChat} from '@/app/lib/agents/chat';
import {POST} from './route';
describe('Agent chat permissions',()=>{
 beforeEach(()=>vi.clearAllMocks());
 it.each([401,403])('blocks denied requests (%s)',async status=>{vi.mocked(requireAdmin).mockResolvedValue({response:new Response(null,{status})});expect((await POST(new Request('https://studio.test/api/admin/agents/chat',{method:'POST'}))).status).toBe(status);expect(agentChat).not.toHaveBeenCalled();});
 it('blocks cross-origin instructions',async()=>{vi.mocked(requireAdmin).mockResolvedValue({user:{id:'admin'} as never});expect((await POST(new Request('https://studio.test/api/admin/agents/chat',{method:'POST',headers:{origin:'https://other.test'}}))).status).toBe(403);expect(agentChat).not.toHaveBeenCalled();});
});
