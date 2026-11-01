export type Plugin = { id: string; name: string; category: string; usedBy: string[]; secrets: string[]; endpoint?: string; planned?: boolean; icon?: string; configHref?: string; runtime?: boolean };
export const plugins: Plugin[] = [
 {id:'openai',name:'OpenAI',category:'AI',usedBy:['Script generation','Language Studio','Images and narration','Agent reviews'],secrets:['OPENAI_API_KEY'],endpoint:'https://api.openai.com/v1/models'},
 {id:'elevenlabs',name:'ElevenLabs',category:'Audio',usedBy:['Studio narration','Presenter voices','Audio tools'],secrets:['ELEVENLABS_API_KEY'],endpoint:'https://api.elevenlabs.io/v1/voices'},
 {id:'runway',name:'Runway',category:'Video',usedBy:['Image and video generation'],secrets:['RUNWAYML_API_SECRET'],endpoint:'https://api.dev.runwayml.com/v1/organization'},
 {id:'mux',name:'Mux',category:'Video',usedBy:['Live streaming','Video webhooks'],secrets:['MUX_TOKEN_ID','MUX_TOKEN_SECRET'],endpoint:'https://api.mux.com/video/v1/assets?page=1&limit=1'},
 {id:'livepeer',name:'Livepeer',category:'Video',usedBy:['Live streaming'],secrets:['LIVEPEER_API_KEY'],endpoint:'https://livepeer.studio/api/stream?limit=1'},
 {id:'daily',name:'Daily',category:'Audio',usedBy:['Guest recording rooms'],secrets:['DAILY_API_KEY'],endpoint:'https://api.daily.co/v1/rooms?limit=1'},
 {id:'apify',name:'Apify',category:'Import',usedBy:['YouTube transcript imports'],secrets:['APIFY_API_TOKEN'],endpoint:'https://api.apify.com/v2/users/me'},
 {id:'deepl',name:'DeepL',category:'Language',usedBy:['Language Studio'],secrets:['DEEPL_API_KEY']},
 {id:'deepseek',name:'DeepSeek',category:'AI',usedBy:['Optional AI routing'],secrets:['DEEPSEEK_API_KEY'],endpoint:'https://api.deepseek.com/models'},
 {id:'higgsfield',name:'Higgsfield',category:'Images',usedBy:['Image generation and editing'],secrets:['HF_API_KEY','HF_API_SECRET']},
 {id:'restream',name:'Restream',category:'Video',usedBy:['Live destination channels'],secrets:['RESTREAM_CLIENT_ID','RESTREAM_CLIENT_SECRET']},
 {id:'supabase',name:'Supabase',category:'Storage',usedBy:['RSS Import Builder'],secrets:['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']},
 {id:'resend',name:'Resend',category:'Notifications',usedBy:['Account email'],secrets:['RESEND_API_KEY']},
 {id:'netlify',name:'Netlify',category:'Storage',usedBy:['Hosted media and workspace storage','Background functions'],secrets:[],runtime:true},
 ...['YouTube','Instagram','TikTok','Facebook','LinkedIn','X','Reddit','Bluesky','Threads','Snapchat','Mastodon','Getty','GitHub','Google Drive','AWS','Notion'].map(name=>({id:name.toLowerCase().replaceAll(' ','-'),name,category:['GitHub','Notion'].includes(name)?'Project Knowledge':['Google Drive','AWS'].includes(name)?'Storage':name==='Getty'?'Images':'Social',usedBy:[],secrets:[],planned:true})),
];
export type Health = { fingerprint: string; checkedAt: string; lastSuccess?: string; duration: number; ok: boolean; httpStatus?: number; error?: string };
export function connectionStatus(plugin: Plugin, configured: boolean, health?: Health, fingerprint?: string, now=Date.now()) {
 if(plugin.planned) return 'Coming Soon';
 if(!configured) return 'Not Connected';
 if(!health || health.fingerprint!==fingerprint || now-Date.parse(health.checkedAt)>86400000) return 'Configured — Not Verified';
 return health.ok?'Connected':'Needs Attention';
}
