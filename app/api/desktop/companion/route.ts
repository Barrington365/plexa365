import {desktopUser} from '@/app/lib/desktop/sessions';
import {createSessionToken,SESSION_COOKIE} from '@/app/lib/auth/sessions';
import {GET as getCompanion,POST as postCompanion} from '@/app/api/agents/companion/route';
export const dynamic='force-dynamic';
async function forward(request:Request){
 const user=await desktopUser(request);if(!user)return Response.json({error:'Desktop sign-in required.'},{status:401});
 // Server-side adapter only. No browser cookie or general purpose session token leaves this route.
 // Reuses the existing handler, including live user/scope rechecks and project validation.
 const url=new URL('/api/agents/companion',request.url);
 const token=createSessionToken({userId:user.id,email:user.email,role:user.role});
 const next=new Request(url,{method:request.method,headers:{cookie:`${SESSION_COOKIE}=${token}`,origin:url.origin,'Content-Type':'application/json'},...(request.method==='POST'?{body:await request.text()}:{})});
 return request.method==='POST'?postCompanion(next):getCompanion(next);
}
export const GET=forward;export const POST=forward;
