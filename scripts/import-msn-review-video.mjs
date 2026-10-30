// Import an explicitly supplied local MP4 into the local Library; no remote services.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {probe} from '../features/msn-local/engine.mjs';
const [source,title,sourceUrl]=process.argv.slice(2);
if(!source||!title)throw Error('Usage: node scripts/import-msn-review-video.mjs /absolute/video.mp4 "Title" [article-url]. Stop the local server before importing.');
if(!path.isAbsolute(source)||path.extname(source).toLowerCase()!=='.mp4')throw Error('Supply an absolute MP4 path.');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../output/msn-local');
const manifest=path.join(root,'jobs.json');
const jobs=JSON.parse(await fs.readFile(manifest,'utf8').catch(()=>'[]'));
if(jobs.some(j=>['running','queued'].includes(j.status)))throw Error('Finish active builds before importing.');
const metadata=await probe(source);if(metadata.width!==1920||metadata.height!==1080||!metadata.audio)throw Error('Review output requires 1920x1080 and audio.');
const digest=createHash('sha256').update(await fs.readFile(source)).digest('hex');
const existing=jobs.find(j=>j.provenance?.sha256===digest);
if(existing){console.log(JSON.stringify({id:existing.id,reused:true}));process.exit(0);}
const id=randomUUID(),now=new Date().toISOString(),file=path.join(root,'videos',id+'.mp4');await fs.mkdir(path.dirname(file),{recursive:true});await fs.copyFile(source,file);
const job={id,status:'complete',stage:'Imported finished article video',progress:100,createdAt:now,updatedAt:now,request:{title,clips:[]},provenance:{sourceUrl:sourceUrl||null,sha256:digest,importedAt:now,voice:'Planet F1 - Male - Sam',generation:'Existing Planet Sport Studio article builder'},output:{...metadata,title,file,updatedAt:now}};
jobs.push(job);await fs.writeFile(manifest+'.tmp',JSON.stringify(jobs,null,2));await fs.rename(manifest+'.tmp',manifest);console.log(JSON.stringify({id,file,...metadata}));
