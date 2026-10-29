import {createHash} from 'node:crypto';
import {createProjectStore} from './projects.mjs';
import {assertAssetKey} from './workspace-store.mjs';
/** Activate a fully verified import with one conditional workspace write. */
export async function activateWorkspaceImport(workspace,manifest,importId){
 if(!/^[a-f0-9]{64}$/.test(importId)||manifest?.version!==1||!Array.isArray(manifest.files))throw Error('Invalid import manifest');
 if(createHash('sha256').update(JSON.stringify(manifest)).digest('hex')!==importId)throw Error('Import manifest integrity check failed');
 const entries=new Map();for(const entry of manifest.files){assertAssetKey(entry.asset);if(entries.has(entry.asset))throw Error('Duplicate import file');entries.set(entry.asset,entry);}
 const documents=new Map();
 for(const entry of entries.values()){const bytes=await workspace.readFile(entry);if(['configuration/brand-kits.json','studio/projects.json','jobs.json','images/catalogue.json','studio/article-inbox.json','library-trash.json','uploads/catalogue.json'].includes(entry.asset))documents.set(entry.asset,JSON.parse(bytes.toString('utf8')));}
 const projectData=documents.get('studio/projects.json');if(!projectData)throw Error('Import has no project store');
 const validation=createProjectStore('/unused',{persistence:{read:async()=>structuredClone(projectData)}});await validation.list();await validation.listTemplates();
 const jobs=documents.get('jobs.json')||[],images=documents.get('images/catalogue.json')||[];
 function portableFile(file){if(typeof file!=='string')throw Error('Missing completed video');const matches=[...entries.keys()].filter(key=>key===file||file.endsWith('/'+key));if(matches.length!==1)throw Error('Completed video has no unique stored file');return matches[0];}
 const importedJobs=jobs.map(job=>{const copy=structuredClone(job);if(copy.status==='complete')copy.stage='Imported to Studio Library';if(copy.output?.file){copy.output.asset=portableFile(copy.output.file);delete copy.output.file;delete copy.output.metadataFile;copy.output.url='/api/studio-workspace/media?asset='+encodeURIComponent(copy.output.asset);}if(copy.request)delete copy.request.replaceDirectory;if(['running','queued','saving'].includes(copy.status)){copy.status='interrupted';copy.stage='Imported unfinished job. Review before retrying.';}return copy;});
 return workspace.update(state=>{
  if(state.imports.includes(importId))return {alreadyImported:true};
  function merge(existing,incoming,label){const values=new Map(existing.map(x=>[x.id,x]));for(const item of incoming){if(values.has(item.id)&&JSON.stringify(values.get(item.id))!==JSON.stringify(item))throw Error('Import conflicts with an existing '+label+'. Existing data has not changed.');values.set(item.id,structuredClone(item));}return [...values.values()];}
  state.projects=merge(state.projects,projectData.projects,'project');state.templates=merge(state.templates,projectData.templates||[],'template');state.jobs=merge(state.jobs,importedJobs,'video');state.images=merge(state.images,images,'image');
  for(const [asset,entry] of entries){if(Object.hasOwn(state.assets,asset)&&state.assets[asset].sha256!==entry.sha256)throw Error('Import conflicts with existing media');const label=(documents.get('uploads/catalogue.json')||{})[asset]||images.find(i=>'images/'+i.id+'.png'===asset)||(manifest.externalAssets||[]).find(c=>c.asset===asset);state.assets[asset]={...entry,...(label?.name?{name:label.name}:{}),...(label?.updatedAt?{updatedAt:label.updatedAt}:{})};}
  if(documents.has('studio/article-inbox.json')){const inbox=documents.get('studio/article-inbox.json');if(state.inbox&&JSON.stringify(state.inbox)!==JSON.stringify(inbox))throw Error('Import conflicts with the article inbox');state.inbox=inbox;}
  for(const [key,value] of Object.entries(documents.get('library-trash.json')||{})){if(Object.hasOwn(state.trash,key)&&JSON.stringify(state.trash[key])!==JSON.stringify(value))throw Error('Import conflicts with Library trash');state.trash[key]=value;}
  if(documents.has('configuration/brand-kits.json')){const kits=documents.get('configuration/brand-kits.json');if(!Array.isArray(kits))throw Error('Invalid imported brand kits');if(state.kits&&JSON.stringify(state.kits)!==JSON.stringify(kits))throw Error('Import conflicts with existing brand kits');state.kits=kits;}
  state.sourceClips=merge(state.sourceClips||[],manifest.externalAssets||[],'source clip');state.imports.push(importId);state.importedAt=new Date().toISOString();state.migrationWarnings=manifest.warnings||[];
  return {alreadyImported:false,projects:state.projects.length,videos:state.jobs.filter(j=>j.status==='complete').length,files:Object.keys(state.assets).length,importedAt:state.importedAt};
 });
}
