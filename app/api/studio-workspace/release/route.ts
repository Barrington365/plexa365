import {requireUser} from '@/app/lib/auth/guards';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const auth=await requireUser(request);if('response' in auth)return auth.response;
 return Response.json({commit:process.env.STUDIO_RELEASE_COMMIT||'local',workspaceVersion:1},{headers:{'Cache-Control':'no-store'}});
}
