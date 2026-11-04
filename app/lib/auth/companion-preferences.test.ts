import {beforeEach,expect,it,vi} from 'vitest';
vi.mock('fs/promises',()=>({default:{readFile:vi.fn(),writeFile:vi.fn(),mkdir:vi.fn()}}));
vi.mock('@/app/lib/netlify-blob-json',()=>({shouldUseNetlifyBlobStore:()=>false}));
import fs from 'fs/promises';
import {saveCompanionPreferences,readCompanionPreferences} from '../agents/companion-preferences';
import {defaultPreferences} from '@/app/lib/agents/companion';
beforeEach(()=>vi.resetAllMocks());
it('patches only preferences while retaining current credentials, role and unrelated users',async()=>{
 const user={id:'u',role:'editor',active:true,emailVerifiedAt:'now',passwordHash:'existing-hash',agentScopes:[{brand:'TEAMtalk',workspace:'pilot'}],name:'Original'};
 const other={id:'other',role:'admin'};
 vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({users:{u:user,other}}));
 await saveCompanionPreferences('u',{...defaultPreferences,size:'small'});
 const saved=JSON.parse(String(vi.mocked(fs.writeFile).mock.calls[0][1]));
 expect(saved.size).toBe('small');expect(saved).not.toHaveProperty('users');expect(String(vi.mocked(fs.writeFile).mock.calls[0][0])).toContain('plexa-companion-preferences');expect(String(vi.mocked(fs.writeFile).mock.calls[0][0])).not.toContain('plexa-auth-users');
});
it('rejects a user whose current role was revoked before preference save',async()=>{
 vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({users:{u:{id:'u',role:'viewer',active:true,emailVerifiedAt:'now'}}}));
 await expect(saveCompanionPreferences('u',defaultPreferences)).rejects.toThrow();expect(fs.writeFile).not.toHaveBeenCalled();
});

it.each([{active:false,emailVerifiedAt:'now'},{active:true,emailVerifiedAt:null}])('rejects inactive or unverified current user %j',async state=>{
 vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({users:{u:{id:'u',role:'admin',...state}}}));
 await expect(saveCompanionPreferences('u',defaultPreferences)).rejects.toThrow();expect(fs.writeFile).not.toHaveBeenCalled();
});

it('rejects preferences reads for missing users',async()=>{
 vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify({users:{}}));
 await expect(readCompanionPreferences('missing')).rejects.toThrow('Agent access required.');
 expect(fs.readFile).toHaveBeenCalledTimes(1);
});
it('loads isolated preferences and treats missing records as unset',async()=>{
 const auth=JSON.stringify({users:{u:{id:'u',role:'admin',active:true,emailVerifiedAt:'now'}}});
 vi.mocked(fs.readFile).mockResolvedValueOnce(auth).mockResolvedValueOnce(JSON.stringify({...defaultPreferences,size:'large'}));
 expect((await readCompanionPreferences('u'))?.size).toBe('large');
 vi.mocked(fs.readFile).mockResolvedValueOnce(auth).mockRejectedValueOnce(Object.assign(Error('Missing'),{code:'ENOENT'}));
 expect(await readCompanionPreferences('u')).toBeUndefined();
});
