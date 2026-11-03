import {requireAdmin} from '@/app/lib/auth/guards';
import {isWorkspaceSameOrigin} from '@/app/lib/studio-workspace/origin';
import {commandSchema} from '@/app/lib/costs/model';
import {readCosts,updateCosts,Conflict} from '@/app/lib/costs/store';
export const dynamic='force-dynamic';
export async function GET(request:Request){const auth=await requireAdmin(request);if('response'in auth)return auth.response;try{return Response.json(await readCosts(),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Cost records unavailable.'},{status:503});}}
export async function POST(request:Request){const auth=await requireAdmin(request);if('response'in auth)return auth.response;if(!isWorkspaceSameOrigin(request))return Response.json({error:'Same-origin request required.'},{status:403});const body=await request.json().catch(()=>null),parsed=commandSchema.safeParse(body?.command);if(!parsed.success||parsed.data.action==='reconcile'||!Number.isSafeInteger(body?.version)||body.version<0)return Response.json({error:'Check the required fields.'},{status:400});try{return Response.json(await updateCosts(parsed.data,body.version,auth.user.id));}catch(e){return Response.json({error:e instanceof Error?e.message:'Save failed.'},{status:e instanceof Conflict?409:400});}}
