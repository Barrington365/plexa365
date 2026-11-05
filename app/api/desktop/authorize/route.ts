import {requireUser} from '@/app/lib/auth/guards';
import {issueDesktopCode} from '@/app/lib/desktop/sessions';
export async function POST(request:Request){
 const auth=await requireUser(request);if('response'in auth)return auth.response;
 if(request.headers.get('origin')!==new URL(request.url).origin)return new Response(null,{status:403});
 const body=await request.json().catch(()=>null);
 if(!body||!['admin','editor'].includes(auth.user.role)||typeof body.challenge!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(body.challenge)||typeof body.state!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(body.state))return new Response(null,{status:400});
 const localTest=process.env.NODE_ENV==='development'&&['localhost','127.0.0.1'].includes(new URL(request.url).hostname);
 const scheme=localTest?'plexa-dev':'plexa';
 const code=await issueDesktopCode(auth.user.id,body.challenge);
 return Response.json({callback:`${scheme}://auth?code=${encodeURIComponent(code)}&state=${encodeURIComponent(body.state)}`},{headers:{'Cache-Control':'no-store'}});
}
