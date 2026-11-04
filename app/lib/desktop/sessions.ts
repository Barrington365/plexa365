import {createHash, randomBytes} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {getStore} from '@netlify/blobs';
import {shouldUseNetlifyBlobStore} from '@/app/lib/netlify-blob-json';
import {projectRoot} from '@/app/lib/paths';
import {readAuthData} from '@/app/lib/auth/store';

// Opaque desktop credentials are scoped to the companion adapter, never browser sessions.
type RecordData={userId:string;expires:number;challenge?:string;passwordSetAt?:string};
const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const directory=()=>path.join(projectRoot(),'data/local/desktop-sessions');
const store=()=>getStore({name:'plexa-desktop-sessions',consistency:'strong'});
async function write(key:string,value:RecordData){
 if(shouldUseNetlifyBlobStore()){const result=await store().setJSON(key,value,{onlyIfNew:true});if(!result.modified)throw Error('Credential collision');return;}
 await fs.mkdir(directory(),{recursive:true,mode:0o700});await fs.writeFile(path.join(directory(),key),JSON.stringify(value),{flag:'wx',mode:0o600});
}
async function read(key:string):Promise<RecordData|null>{
 if(shouldUseNetlifyBlobStore())return store().get(key,{type:'json'});
 try{return JSON.parse(await fs.readFile(path.join(directory(),key),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
}
async function consume(key:string):Promise<RecordData|null>{
 if(shouldUseNetlifyBlobStore()){
  const s=store(),r=await s.getWithMetadata(key,{type:'json'});if(!r?.etag)return null;
  const used=await s.setJSON(key,{userId:'',expires:0},{onlyIfMatch:r.etag});return used.modified?r.data as RecordData:null;
 }
 const file=path.join(directory(),key),taken=file+'.'+randomBytes(12).toString('hex');
 try{await fs.rename(file,taken);}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
 try{return JSON.parse(await fs.readFile(taken,'utf8'));}finally{await fs.unlink(taken);}
}
export async function issueDesktopCode(userId:string,challenge:string){
 if(!/^[A-Za-z0-9_-]{43}$/.test(challenge))throw Error('Invalid challenge');
 const user=(await readAuthData()).users[userId];if(!user?.active||!user.emailVerifiedAt||!['admin','editor'].includes(user.role))throw Error('Access denied');
 const code=randomBytes(32).toString('base64url');await write('code-'+hash(code),{userId,challenge,expires:Date.now()+120000,passwordSetAt:user.passwordSetAt});return code;
}
export async function exchangeDesktopCode(code:string,verifier:string){
 if(!/^[A-Za-z0-9_-]{43}$/.test(code)||!/^[A-Za-z0-9_-]{43,128}$/.test(verifier))throw Error('Invalid code');
 const key='code-'+hash(code),r=await read(key);
 const challenge=createHash('sha256').update(verifier).digest('base64url');
 if(!r||r.expires<=Date.now()||r.challenge!==challenge)throw Error('Invalid or expired code');
 const claimed=await consume(key);if(!claimed||claimed.expires<=Date.now()||claimed.challenge!==challenge)throw Error('Code already used');
 const user=(await readAuthData()).users[claimed.userId];
 if(!user?.active||!user.emailVerifiedAt||!['admin','editor'].includes(user.role)||user.passwordSetAt!==claimed.passwordSetAt)throw Error('Access revoked');
 const token=randomBytes(32).toString('base64url'),expires=Date.now()+12*60*60*1000;
 await write('token-'+hash(token),{userId:user.id,expires,passwordSetAt:user.passwordSetAt});return {token,expires};
}
export async function desktopUser(request:Request){
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
 if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;
 const r=await read('token-'+hash(token));if(!r||r.expires<=Date.now())return null;
 const user=(await readAuthData()).users[r.userId];
 return user?.active&&user.emailVerifiedAt&&['admin','editor'].includes(user.role)&&user.passwordSetAt===r.passwordSetAt?user:null;
}
export async function revokeDesktop(request:Request){
 const token=request.headers.get('authorization')?.replace(/^Bearer /,'')??'';
 if(/^[A-Za-z0-9_-]{43}$/.test(token))await consume('token-'+hash(token));
}
