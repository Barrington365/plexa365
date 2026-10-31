import {hostedWorkspace} from '@/app/lib/studio-workspace/store';
import {playerPage} from '@/features/msn-local/publishing.mjs';
import fs from 'node:fs/promises';import path from 'node:path';
import {requireUser} from '@/app/lib/auth/guards';
import {workspacePage,hostedUI} from '@/features/msn-local/hosted-ui.mjs';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{path?:string[]}>}){
 const auth=await requireUser(request);if('response' in auth)return auth.response;
 if(!['admin','editor','viewer'].includes(auth.user.role))return new Response('Studio access required',{status:403});
 const segments=(await params).path||[];if(segments.length===2&&segments[0]==='embed'){const job=(await hostedWorkspace().snapshot()).state.jobs.find((j:{id:string})=>j.id===segments[1]);if(job?.status!=='complete'||job.publication?.status!=='published')return new Response('Player unavailable',{status:404});const html=playerPage(job).replace('/published-video/','/api/studio-workspace/published-video/').replace('Local player preview','Studio player').replace('Not publicly hosted','Studio sign-in required');return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; media-src 'self'; frame-ancestors 'self'"}});}if(segments.length>1)return new Response('Not found',{status:404});if(segments[0]==='import'&&auth.user.role!=='admin')return new Response('Administrator access required',{status:403});const file=workspacePage(segments[0]||'');if(!file)return new Response('Not found',{status:404});
 const source=await fs.readFile(path.join(process.cwd(),'features/msn-local',file),'utf8');
 return new Response(hostedUI(source,{role:auth.user.role}),{headers:{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'private, no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'}});
}
