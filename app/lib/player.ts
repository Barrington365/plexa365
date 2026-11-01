import {hostedWorkspace} from '@/app/lib/studio-workspace/store';
import {readLanguageStudioData} from '@/app/lib/language-studio/store';
import {visibleVideo,publicVideo} from '@/features/player/service.mjs';
export async function playerContext(){const workspace=hostedWorkspace();const [{state},data]=await Promise.all([workspace.snapshot(),readLanguageStudioData()]);return {workspace,state,clients:data.clients};}
export function playerBase(){const raw=process.env.PLEXA_PLAYER_ORIGIN||'https://planetsport.studio';const u=new URL(raw);if(u.protocol!=='https:'&&!(process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1'].includes(u.hostname)))throw Error('Invalid player origin');return u.origin;}
export async function published(id:string,destination:string){const ctx=await playerContext();const video=ctx.state.websiteVideos?.find((v:{id:string;destinationId:string})=>v.id===id&&v.destinationId===destination);if(!visibleVideo(ctx.state,ctx.clients,video))return null;return {...ctx,video,destination:ctx.state.playerDestinations.find((d:{id:string})=>d.id===destination),dto:publicVideo(ctx.state,video,playerBase())};}
