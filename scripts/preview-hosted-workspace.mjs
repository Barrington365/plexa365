/** Loopback-only QA harness for the production adapters. No provider keys or paid calls. */
import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';
import {diskObjectStore} from '../features/msn-local/disk-object-store.mjs';import {createWorkspaceStore} from '../features/msn-local/workspace-store.mjs';import {workspaceRead,workspaceWrite} from '../features/msn-local/workspace-api.mjs';import {workspacePage,hostedUI} from '../features/msn-local/hosted-ui.mjs';import {queueWorkspaceRender,runWorkspaceRender} from '../features/msn-local/workspace-render.mjs';
const port=8102,origin='http://127.0.0.1:'+port,workspace=createWorkspaceStore(diskObjectStore(path.resolve('output/studio-hosted-preview')));
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
http.createServer(async(req,res)=>{try{
 if(req.headers.host!=='127.0.0.1:'+port||req.method==='POST'&&req.headers.origin!==origin)return json(res,403,{error:'Local QA origin only'});
 const url=new URL(req.url,origin);
 if(req.method==='GET'&&url.pathname.startsWith('/workspace')){const page=url.pathname.slice('/workspace'.length).replace(/^\//,'');const file=workspacePage(page);if(!file)return json(res,404,{error:'Page not found'});res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html':'text/javascript','Cache-Control':'no-store'});res.end(hostedUI(await fs.readFile(path.join('features/msn-local',file),'utf8')));return;}
 if(!url.pathname.startsWith('/api/studio-workspace/'))return json(res,404,{error:'Not part of the hosted QA workspace'});
 const route=url.pathname.slice('/api/studio-workspace/'.length);
 if(req.method==='GET'){
  if(route==='media'){const {entry,range,stream}=await workspace.openFile(url.searchParams.get('asset'),req.headers.range);const type=({'mp4':'video/mp4','mp3':'audio/mpeg','wav':'audio/wav','m4a':'audio/mp4','png':'image/png','jpg':'image/jpeg','jpeg':'image/jpeg','webp':'image/webp'})[entry.asset.split('.').at(-1)];if(!type)return json(res,404,{error:'Media not found'});res.writeHead(range.status,{'Content-Type':type,'Accept-Ranges':'bytes','Content-Length':range.end-range.start+1,...(range.status===206?{'Content-Range':`bytes ${range.start}-${range.end}/${entry.bytes}`}:{})});for await(const chunk of stream)res.write(chunk);res.end();return;}
  if(route.startsWith('image/')){res.writeHead(307,{Location:'/api/studio-workspace/media?asset='+encodeURIComponent('images/'+route.split('/')[1]+'.png')});res.end();return;}
  if(route==='projects')return json(res,200,{projects:await workspace.projects.list(),trash:await workspace.projects.list({trash:true}),templates:await workspace.projects.listTemplates()});
  if(route==='elevenlabs/status')return json(res,200,{configured:false,configurationSource:'Paid providers disabled in isolated QA'});
  return json(res,200,await workspaceRead(workspace,route));
 }
 if(req.method==='POST'){
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>20e6)throw Error('Request too large');}const body=JSON.parse(raw);
  if(route==='build'){const job=await queueWorkspaceRender(workspace,body,'local-qa');json(res,202,job);void runWorkspaceRender(workspace,job.id).catch(error=>console.error('QA build failed:',error.message));return;}
  const result=await workspaceWrite(workspace,route,body);if(route==='images/preview'){res.writeHead(200,{'Content-Type':'image/png'});res.end(result);return;}return json(res,200,result);
 }
 return json(res,405,{error:'Method not allowed'});
}catch(error){if(res.headersSent)res.destroy(error);else json(res,400,{error:error.message});}}).listen(port,'127.0.0.1',()=>console.log('Isolated hosted-workspace QA: '+origin+'/workspace/projects'));
