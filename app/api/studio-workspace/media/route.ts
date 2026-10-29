import {requireUser} from '@/app/lib/auth/guards';
import {hostedWorkspace} from '@/app/lib/studio-workspace/store';
export const runtime='nodejs';export const dynamic='force-dynamic';
const types:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',mp4:'video/mp4',mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',ogg:'audio/ogg',flac:'audio/flac'};
export async function GET(request:Request){
 const auth=await requireUser(request);if('response' in auth)return auth.response;
 if(!['admin','editor','viewer'].includes(auth.user.role))return Response.json({error:'Studio access required'},{status:403});
 const url=new URL(request.url),asset=url.searchParams.get('asset')||'',type=types[asset.split('.').at(-1)?.toLowerCase()||''];
 if(!type)return Response.json({error:'Media not found'},{status:404});
 try{const workspace=hostedWorkspace();let opened;try{opened=await workspace.openFile(asset,request.headers.get('range'));}catch(error){if(error instanceof Error&&error.message==='Invalid byte range'){const state=(await workspace.snapshot()).state;return new Response(null,{status:416,headers:{'Content-Range':`bytes */${state.assets[asset]?.bytes||0}`}});}throw error;}const {entry,range,stream}=opened;
 const headers:Record<string,string>={'Content-Type':type,'Accept-Ranges':'bytes','Content-Length':String(range.end-range.start+1),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 if(range.status===206)headers['Content-Range']=`bytes ${range.start}-${range.end}/${entry.bytes}`;
 if(url.searchParams.has('download'))headers['Content-Disposition']=`attachment; filename="${asset.split('/').at(-1)!.replace(/[^A-Za-z0-9._-]/g,'_')}"`;
 const body=new ReadableStream<Uint8Array>({async pull(controller){try{const part=await stream.next();if(part.done)controller.close();else controller.enqueue(part.value);}catch(error){controller.error(error);}},async cancel(){await stream.return(undefined);}});
 return new Response(body,{status:range.status,headers});
 }catch{return Response.json({error:'Stored media could not be loaded. Please try again.'},{status:503});}
}
