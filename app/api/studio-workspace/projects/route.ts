import {NextResponse} from 'next/server';
import {requireUser} from '@/app/lib/auth/guards';
import {hostedWorkspace} from '@/app/lib/studio-workspace/store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
function projects(){return hostedWorkspace().projects;}
export async function GET(request:Request){
 const auth=await requireUser(request);if('response' in auth)return auth.response;
 if(!['admin','editor','viewer'].includes(auth.user.role))return NextResponse.json({error:'Studio access required'},{status:403});
 try{const store=projects();return NextResponse.json({projects:await store.list(),trash:await store.list({trash:true}),templates:await store.listTemplates()},{headers:{'Cache-Control':'no-store'}});}
 catch{return NextResponse.json({error:'Studio projects could not be loaded. Saved content has not been replaced.'},{status:503});}
}
export async function POST(request:Request){
 const auth=await requireUser(request);if('response' in auth)return auth.response;
 if(!['admin','editor'].includes(auth.user.role))return NextResponse.json({error:'Editing access required'},{status:403});
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'Same-origin request required'},{status:403});
 try{
  const raw=await request.text();if(raw.length>2_000_000)return NextResponse.json({error:'Project exceeds request limit'},{status:413});
  const body=JSON.parse(raw);if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid project request');
  const store=projects();let result;
  switch(body.action){
   case 'create': result=await store.create(body.templateId,{title:body.title});break;
   case 'save': {
    if(typeof body.id!=='string'||typeof body.expectedUpdatedAt!=='string')throw Error('A saved project revision is required');
    result=await store.save(body.id,body.patch,body.expectedUpdatedAt);break;
   }
   case 'trash':result=await store.trash(body.id);break;
   case 'restore':result=await store.restore(body.id);break;
   case 'save-template':result=await store.saveTemplate({projectId:body.id,name:body.name});break;
   default:throw Error('Unknown project action');
  }
  return NextResponse.json({result},{headers:{'Cache-Control':'no-store'}});
 }catch(error){const message=error instanceof Error?error.message:'Project update failed';return NextResponse.json({error:message},{status:/changed|Another editor/.test(message)?409:400});}
}
