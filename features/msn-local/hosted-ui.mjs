/** Mount the existing editor under an isolated authenticated route during upgrade QA. */
const pages={automations:'automations.html',import:'hosted-import.html','hosted-transport.js':'hosted-transport.js','':'studio.html',studio:'studio.html',home:'studio.html',projects:'studio.html',templates:'studio.html',article:'articles.html',articles:'articles.html',library:'library.html',social:'social.html',video:'video.html',images:'images.html','image-editor':'image-editor.html','msn-video':'index.html',settings:'settings.html',admin:'settings.html',tools:'settings.html',development:'settings.html',studios:'settings.html','studio-navigation.js':'navigation.js','studio-animation.mjs':'animation.mjs','studio-screen-mapping.mjs':'screen-mapping.mjs'};
export function workspacePage(pathname){return Object.hasOwn(pages,pathname)?pages[pathname]:null;}
export function hostedUI(source){
 const paths=['automations','studio','home','projects','templates','articles','article','library','social','video','images','image-editor','msn-video','settings','tools','development','studios','studio-navigation.js','studio-animation.mjs','studio-screen-mapping.mjs'];
 source=source.replace(/(["'`])\/(image|asset|video)\//g,'$1/api/studio-workspace/$2/');
 source=source.replace(/(["'`])\/embed\//g,'$1/workspace/embed/');
 let text=source.replace(/(["'`])\/api\/(?!studio-workspace\/)/g,'$1/api/studio-workspace/');
 for(const p of paths){const escaped=p.replaceAll('.','\\.');text=text.replace(new RegExp('(["\'`])/('+escaped+')(?=[/?#"\'`])','g'),'$1/workspace/$2');}
 text=text.replace(/(["'`])\/studio-asset\?path=/g,'$1/api/studio-workspace/media?asset=');
 text=text.replaceAll("a.href='/'+key","a.href='/workspace/'+key");
 text=text.replaceAll("location.pathname.slice(1)","location.pathname.replace('/workspace', '').slice(1)");
 text=text.replaceAll('Saved on this computer.','Saved in Studio.').replaceAll('Files and processing stay on this Mac.','Files and processing stay within Studio.').replaceAll('No cloud sharing or publishing.','Editorial review is required before publishing.').replaceAll('Saved to local Library','Saved to Studio Library').replaceAll('local assets available','Studio assets available').replaceAll('Project saved on this computer.','Project saved in Studio.');
 text=text.replace('<details id="eleven-connection">','<details id="eleven-connection" hidden>');
 text=text.replace('Not connected. Enter your ElevenLabs key below to generate Sam here.','ElevenLabs is not configured. Ask a Studio administrator to check the existing provider connection.');
 if(text.includes('</head>'))text=text.replace('</head>','<script src="/workspace/hosted-transport.js"></script></head>');
 text=text.replaceAll('Update submitted. This video is replaced after a successful render.','Update submitted. A new version is saved after a successful render; the previous video stays available.').replaceAll('YOUR LOCAL WORKSPACE','YOUR STUDIO WORKSPACE').replaceAll('● LOCAL WORKSPACE','● STUDIO WORKSPACE').replaceAll('Local editing and rendering · optional ElevenLabs narration · no public publishing.','Studio editing and rendering · optional ElevenLabs narration · publishing remains separate.');
 text=text.replaceAll('Publish local player','Enable Studio player').replaceAll('Publish video','Enable Studio player').replaceAll('Unpublish','Disable Studio player').replaceAll('This creates a player link on this computer only. It does not upload or publish to MSN or a website.','This enables a player link for signed-in Studio users. It does not publish to MSN or a public website.').replaceAll('Local demonstration only. This embed will not work for readers on a public website until hosting is configured.','This player requires Studio sign-in. Public website embedding is not enabled.');
 text=text.replaceAll("YOUR LOCAL MEDIA WORKSPACE","YOUR STUDIO MEDIA WORKSPACE").replaceAll("LOCAL LIBRARY","STUDIO LIBRARY").replaceAll("Local Library loaded.","Studio Library loaded.").replaceAll("Only assets returned by local services are shown.","Only assets stored in Studio are shown.");
 return text;
}
