import {getStore} from '@netlify/blobs';
import path from 'node:path';
import {shouldUseNetlifyBlobStore} from '@/app/lib/netlify-blob-json';
import {diskObjectStore} from '@/features/msn-local/disk-object-store.mjs';
import {createWorkspaceStore} from '@/features/msn-local/workspace-store.mjs';
export function workspaceObjects(){return shouldUseNetlifyBlobStore()?getStore({name:'plexa-studio-workspace',consistency:'strong'}):diskObjectStore(path.join(process.cwd(),'output/studio-hosted-preview'));}
export function hostedWorkspace(){return createWorkspaceStore(workspaceObjects());}
