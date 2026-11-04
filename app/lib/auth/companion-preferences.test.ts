import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('fs/promises',()=>({default:{readFile:vi.fn(),writeFile:vi.fn(),mkdir:vi.fn()}}));
vi.mock('@/app/lib/netlify-blob-json',()=>({shouldUseNetlifyBlobStore:()=>false}));
import fs from 'fs/promises';
import {saveCompanionPreferences} from './store';
import {defaultPreferences} from '@/app/lib/agents/companion';
beforeEach(()=>vi.resetAllMocks());
it('patches only preferences while retaining current credentials, role and unrelated users',async()=>{
 const user={id:'u',role:'editor',active:true,emailVerifiedAt:'now',passwordHash:'existing-hash',agentScopes:[{brand:'TEAMtalk',workspace:'pilot'}],name:'Original'};
 const other={id:'other',role:'admin'};
 vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({users:{u:user,other}}));
 await saveCompanionPreferences('u',{...defaultPreferences,size:'small'});
 const saved=JSON.parse(String(vi.mocked(fs.writeFile).mock.calls[0][1]));
 expect(saved.users.u).toMatchObject(user);expect(saved.users.other).toEqual(other);expect(saved.users.u.agentCompanion.size).toBe('small');
});
it('rejects a user whose current role was revoked before preference save',async()=>{
 vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({users:{u:{id:'u',role:'viewer',active:true,emailVerifiedAt:'now'}}}));
 await expect(saveCompanionPreferences('u',defaultPreferences)).rejects.toThrow();expect(fs.writeFile).not.toHaveBeenCalled();
});

it.each([{active:false,emailVerifiedAt:'now'},{active:true,emailVerifiedAt:null}])('rejects inactive or unverified current user %j',async state=>{
 vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({users:{u:{id:'u',role:'admin',...state}}}));
 await expect(saveCompanionPreferences('u',defaultPreferences)).rejects.toThrow();expect(fs.writeFile).not.toHaveBeenCalled();
});
