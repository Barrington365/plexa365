import {afterEach,describe,expect,it,vi} from 'vitest';
import {isWorkspaceSameOrigin,workspaceOrigin} from './origin';
afterEach(()=>vi.unstubAllEnvs());
describe('Studio deployment origin',()=>{
 it('accepts the configured public origin behind Netlify internal URLs',()=>{
  vi.stubEnv('URL','https://planetsport.studio');
  const req=new Request('http://localhost:3000/api/studio-workspace/chunk',{headers:{origin:'https://planetsport.studio'}});
  expect(isWorkspaceSameOrigin(req)).toBe(true);expect(workspaceOrigin(req)).toBe('https://planetsport.studio');
 });
 it('rejects foreign, missing, null origins and spoofed forwarding headers',()=>{
  vi.stubEnv('URL','https://planetsport.studio');
  for(const origin of ['https://evil.example','null','']){
   const req=new Request('http://localhost/api',{headers:{origin,'x-forwarded-host':'evil.example'}});
   expect(isWorkspaceSameOrigin(req)).toBe(false);expect(workspaceOrigin(req)).toBe('https://planetsport.studio');
  }
 });
 it('supports exact deploy preview origins, not arbitrary subdomains',()=>{
  vi.stubEnv('URL','https://planetsport.studio');vi.stubEnv('DEPLOY_PRIME_URL','https://preview-1.netlify.app');
  expect(isWorkspaceSameOrigin(new Request('http://internal/api',{headers:{origin:'https://preview-1.netlify.app'}}))).toBe(true);
  expect(isWorkspaceSameOrigin(new Request('http://internal/api',{headers:{origin:'https://preview-2.netlify.app'}}))).toBe(false);
 });
 it('retains local same-origin checks without deployment configuration',()=>{
  vi.stubEnv('URL','');vi.stubEnv('DEPLOY_PRIME_URL','');vi.stubEnv('DEPLOY_URL','');
  expect(isWorkspaceSameOrigin(new Request('http://localhost:8102/api',{headers:{origin:'http://localhost:8102'}}))).toBe(true);
 });
});
