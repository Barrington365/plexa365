/** Hosting adapter: conditional writes prevent concurrent editors losing drafts.
 * No remote call occurs until an explicitly injected store is used.
 */
const empty=()=>({version:1,projects:[],templates:[]});
export function projectPersistence(store,key='projects.json'){
 async function snapshot(){const result=await store.getWithMetadata(key,{type:'json',consistency:'strong'});if(!result)return {data:empty(),etag:null};if(!result.etag)throw Error('Project store did not return a revision.');return {data:structuredClone(result.data),etag:result.etag};}
 return {
  async read(){return (await snapshot()).data;},
  async update(change){
   const {data,etag}=await snapshot();
   const result=change(data);
   const write=await store.setJSON(key,data,etag?{onlyIfMatch:etag}:{onlyIfNew:true});
   if(!write.modified)throw Error('Another editor saved changes. Reload before saving; your changes were not written.');
   return structuredClone(result);
  }
 };
}

import {createProjectStore} from './projects.mjs';
export function createHostedProjects(directory,store){return createProjectStore(directory,{persistence:projectPersistence(store)});}
