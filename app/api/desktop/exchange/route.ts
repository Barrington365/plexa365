import {exchangeDesktopCode} from '@/app/lib/desktop/sessions';
export async function POST(request:Request){
 try{const body=await request.json();return Response.json(await exchangeDesktopCode(body.code,body.verifier),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Sign-in expired or invalid. Start sign-in again.'},{status:401,headers:{'Cache-Control':'no-store'}});}
}
