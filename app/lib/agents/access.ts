import type {PlexaUser} from '@/app/lib/auth/types';
export function canAccessAgent(user:PlexaUser,agent:{id:string;brand:string;workspace:string}){
 return user.active&&!!user.emailVerifiedAt&&(user.role==='admin'||(user.role==='editor'&&['bob','fiddle'].includes(agent.id)&&!!user.agentScopes?.some(s=>s.brand===agent.brand&&s.workspace===agent.workspace)));
}
