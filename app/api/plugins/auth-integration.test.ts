import {beforeEach,describe,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({users:{} as Record<string,unknown>,inventory:vi.fn(),check:vi.fn()}));
vi.mock('@/app/lib/auth/store',()=>({readAuthData:async()=>({users:state.users})}));
vi.mock('@/app/lib/plugins/service',()=>({inventory:state.inventory,safeCheck:state.check}));
import {createSessionToken} from '@/app/lib/auth/sessions';
import {GET,POST} from './route';
import type {PlexaUserRole} from '@/app/lib/auth/types';
beforeEach(()=>{vi.clearAllMocks();state.users={};state.inventory.mockResolvedValue([]);vi.stubEnv('PLEXA_SESSION_SECRET','test-only-plugins-session-secret');vi.stubEnv('URL','https://studio.test');vi.stubEnv('DEPLOY_PRIME_URL','');vi.stubEnv('DEPLOY_URL','');});
function request(role:PlexaUserRole,method='GET',origin='https://studio.test'){state.users.test={id:'test',email:'test@example.invalid',role,active:true,emailVerifiedAt:'2026-01-01'};const token=createSessionToken({userId:'test',email:'test@example.invalid',role});return new Request('https://studio.test/api/plugins',{method,headers:{cookie:'plexa_session='+token,origin},...(method==='POST'?{body:'{"id":"openai"}'}:{})});}
describe('Plugins real session and guard boundary',()=>{
 it.each(['admin','editor','viewer'] as PlexaUserRole[])('%s can read inventory',async role=>expect((await GET(request(role))).status).toBe(200));
 it.each(['editor','viewer','meeting_guest'] as PlexaUserRole[])('%s cannot run provider checks',async role=>{expect((await POST(request(role,'POST'))).status).toBe(403);expect(state.check).not.toHaveBeenCalled();});
 it('allows verified Admin same-origin checks',async()=>{expect((await POST(request('admin','POST'))).status).toBe(200);expect(state.check).toHaveBeenCalledOnce();});
 it('uses current stored role after Admin is revoked',async()=>{const req=request('admin','POST');(state.users.test as {role:string}).role='viewer';expect((await POST(req)).status).toBe(403);expect(state.check).not.toHaveBeenCalled();});
 it('rejects inactive and unverified accounts',async()=>{const req=request('admin','POST');(state.users.test as {active:boolean}).active=false;expect((await POST(req)).status).toBe(403);(state.users.test as {active:boolean}).active=true;delete (state.users.test as {emailVerifiedAt?:string}).emailVerifiedAt;expect((await POST(req)).status).toBe(403);expect(state.check).not.toHaveBeenCalled();});
 it('rejects missing authentication and cross-origin requests',async()=>{expect((await POST(new Request('https://studio.test/api/plugins',{method:'POST'}))).status).toBe(401);expect((await POST(request('admin','POST','https://other.invalid'))).status).toBe(403);expect(state.check).not.toHaveBeenCalled();});
});
