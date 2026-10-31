import { requireAdmin } from '@/app/lib/auth/guards';
import { agentChat } from '@/app/lib/agents/chat';
import { buildDevGatewayContext, type DevGatewayContextKey } from '@/app/lib/dev-gateway/context';
import { z } from 'zod';
export const dynamic='force-dynamic';
export const maxDuration=120;
const bodySchema=z.object({userPrompt:z.string().trim().min(1).max(16000),agentId:z.string().default('manager'),contextKeys:z.array(z.enum(['article_studio','knowledge_base','language_studio','creator_profiles','prompt_rules','quality_checks','loop_feed','priority_reporters','match_report_builder','brand_guides','recent_dev_notes','current_page_context'])).max(12).default([]),currentPage:z.string().max(500).optional()});
export async function POST(request:Request){
 const auth=await requireAdmin(request);if('response' in auth)return auth.response;
 if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Same-origin request required.'},{status:403});
 const body=bodySchema.safeParse(await request.json().catch(()=>null));
 if(!body.success)return Response.json({error:'Check your instruction and context selection.'},{status:400});
 try{return Response.json(await agentChat(body.data.userPrompt,body.data.agentId,await buildDevGatewayContext(body.data.contextKeys as DevGatewayContextKey[],body.data.currentPage)),{headers:{'Cache-Control':'no-store'}});}
 catch(e){return Response.json({error:e instanceof Error?e.message:'Agent request failed.'},{status:400});}
}
