/** Load the actual zipped Netlify worker in isolation; no credentials or jobs. */
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'plexa-worker-package-'));
try{
 execFileSync('unzip',['-q',path.resolve('.netlify/functions/studio-workspace-build-background.zip'),'-d',root]);
 const entry=path.join(root,'netlify/functions/studio-workspace-build-background.mjs');
 execFileSync(process.execPath,['--input-type=module','-e',`const {default:worker}=await import(${JSON.stringify('file://'+entry)});const r=await worker(new Request('https://example.test/worker'));if(r.status!==405)throw Error('Expected method rejection');const unauth=await worker(new Request('https://example.test/worker',{method:'POST'}));if(unauth.status!==401)throw Error('Expected authentication rejection');console.log('Packaged background worker loads, rejects unsupported methods and enforces authentication.');`],{cwd:root,stdio:'inherit',env:{PATH:process.env.PATH,NODE_ENV:'production'}});
}finally{await fs.rm(root,{recursive:true,force:true});}
