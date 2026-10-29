import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createArticleInbox} from './article-inbox.mjs';import {createProjectStore} from './projects.mjs';
/** Apply existing article rules to an isolated snapshot; commit article/project linkage together. */
export async function workspaceArticle(workspace,action,body){
 const {state}=await workspace.snapshot(),root=await fs.mkdtemp(path.join(os.tmpdir(),'plexa-article-'));
 try{
  await fs.writeFile(path.join(root,'projects.json'),JSON.stringify({version:1,projects:state.projects,templates:state.templates}));if(state.inbox)await fs.writeFile(path.join(root,'article-inbox.json'),JSON.stringify(state.inbox));
  const projects=createProjectStore(root),inbox=createArticleInbox(root,projects);let result;
  switch(action){case 'import':result=await inbox.import(body);break;case 'hold':result=await inbox.hold(body.id);break;case 'unhold':result=await inbox.unhold(body.id);break;case 'project':result=await inbox.createProject(body.id,body.templateId);break;default:throw Error('Unknown article action');}
  const nextProjects=JSON.parse(await fs.readFile(path.join(root,'projects.json'),'utf8')),nextInbox=await inbox.snapshot();
  return await workspace.update(current=>{if(JSON.stringify(current.projects)!==JSON.stringify(state.projects)||JSON.stringify(current.inbox)!==JSON.stringify(state.inbox))throw Error('Another editor saved changes. Reload the article inbox.');current.projects=nextProjects.projects;current.inbox=nextInbox;return result;});
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
