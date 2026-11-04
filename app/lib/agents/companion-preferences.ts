import fs from 'fs/promises';
import path from 'path';
import {createHash} from 'crypto';
import {getStore} from '@netlify/blobs';
import {projectRoot} from '@/app/lib/paths';
import {shouldUseNetlifyBlobStore} from '@/app/lib/netlify-blob-json';
import {readAuthData} from '@/app/lib/auth/store';
import {preferencesSchema,type CompanionPreferences} from './companion';
const store='plexa-companion-preferences';
const key=(id:string)=>createHash('sha256').update(id).digest('hex')+'.json';
const file=(id:string)=>path.join(projectRoot(),'data','local',store,key(id));
export async function readCompanionPreferences(userId:string):Promise<CompanionPreferences|undefined>{
 const {users}=await readAuthData();const user=users[userId];
 if(!user?.active||!user.emailVerifiedAt||!['admin','editor'].includes(user.role))throw Error('Agent access required.');
 let value:unknown;
 if(shouldUseNetlifyBlobStore())value=await getStore(store).get(key(userId),{type:'json'});
 else {try{value=JSON.parse(await fs.readFile(file(userId),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}}
 if(value==null)return undefined;
 const parsed=preferencesSchema.safeParse(value);return parsed.success?parsed.data:undefined;
}
/** Preferences cannot overwrite credentials, roles, scopes or another user's record. */
export async function saveCompanionPreferences(userId:string,preferences:CompanionPreferences):Promise<void>{
 const value=preferencesSchema.parse(preferences);
 const {users}=await readAuthData();const user=users[userId];
 if(!user?.active||!user.emailVerifiedAt||!['admin','editor'].includes(user.role))throw Error('Agent access required.');
 if(shouldUseNetlifyBlobStore()){await getStore(store).setJSON(key(userId),value);return;}
 await fs.mkdir(path.dirname(file(userId)),{recursive:true});
 await fs.writeFile(file(userId),JSON.stringify(value),'utf8');
}
