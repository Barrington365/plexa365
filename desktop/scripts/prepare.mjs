import {cp,mkdir,rm} from 'node:fs/promises';
const out=new URL('../dist/',import.meta.url);
await rm(out,{recursive:true,force:true});await mkdir(out,{recursive:true});
await cp(new URL('../ui/',import.meta.url),out,{recursive:true});
await cp(new URL('../../public/agents/',import.meta.url),new URL('agents/',out),{recursive:true});
