import {requireUser} from '@/app/lib/auth/guards';import {hostedWorkspace} from '@/app/lib/studio-workspace/store';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){
 const auth=await requireUser(request);if('response' in auth)return auth.response;if(!['admin','editor'].includes(auth.user.role))return Response.json({error:'Editing access required'},{status:403});if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Same-origin request required'},{status:403});
 const bytes=Buffer.from(await request.arrayBuffer());if(!bytes.length||bytes.length>4*1024*1024)return Response.json({error:'Upload chunk must be between 1 byte and 4 MB'},{status:413});
 try{const entry=await hostedWorkspace().putBytes('uploads/pending',bytes);return Response.json({chunk:entry.chunks[0]});}catch{return Response.json({error:'Upload could not be stored'},{status:503});}
}
