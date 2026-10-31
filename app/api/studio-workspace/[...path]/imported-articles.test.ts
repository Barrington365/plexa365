import {beforeEach,describe,it,expect,vi} from 'vitest';
vi.mock('@/app/lib/auth/guards',()=>({requireUser:vi.fn()}));
vi.mock('@/app/lib/studio-workspace/store',()=>({hostedWorkspace:vi.fn()}));
vi.mock('@/features/msn-local/workspace-api.mjs',()=>({workspaceRead:vi.fn(),workspaceWrite:vi.fn()}));
vi.mock('@/app/lib/language-studio/store',()=>({readLanguageStudioData:vi.fn()}));
import {requireUser} from '@/app/lib/auth/guards';
import {hostedWorkspace} from '@/app/lib/studio-workspace/store';
import {workspaceRead,workspaceWrite} from '@/features/msn-local/workspace-api.mjs';
import {readLanguageStudioData} from '@/app/lib/language-studio/store';
import {GET,POST} from './route';
const params={params:Promise.resolve({path:['article-inbox']})};
describe('Imported articles feed',()=>{
 beforeEach(()=>vi.clearAllMocks());
 it('lets a viewer read imported articles without copying records',async()=>{const update=vi.fn();vi.mocked(requireUser).mockResolvedValue({user:{role:'viewer'} as never});vi.mocked(hostedWorkspace).mockReturnValue({update} as never);vi.mocked(workspaceRead).mockResolvedValue({articles:[]});vi.mocked(readLanguageStudioData).mockResolvedValue({articles:{a:{id:'a',title:'Imported',body:'Original text',sourceBrand:'PlanetF1',sourceUrl:'https://planetf1.com/news/test'}}} as never);const response=await GET(new Request('https://studio.test/api/studio-workspace/article-inbox'),params);expect(response.status).toBe(200);expect((await response.json()).articles[0].title).toBe('Imported');expect(update).not.toHaveBeenCalled();expect(workspaceWrite).not.toHaveBeenCalled();});
 it('does not turn an importer failure into an empty success',async()=>{vi.mocked(requireUser).mockResolvedValue({user:{role:'admin'} as never});vi.mocked(workspaceRead).mockResolvedValue({articles:[]});vi.mocked(readLanguageStudioData).mockRejectedValue(new Error('Unavailable'));expect((await GET(new Request('https://studio.test/api/studio-workspace/article-inbox'),params)).status).toBe(503);});
 it('blocks viewer writes before syncing imported records',async()=>{vi.mocked(requireUser).mockResolvedValue({user:{role:'viewer'} as never});expect((await POST(new Request('https://studio.test/api/studio-workspace/article-inbox/hold',{method:'POST'}),params)).status).toBe(403);expect(readLanguageStudioData).not.toHaveBeenCalled();});
});
