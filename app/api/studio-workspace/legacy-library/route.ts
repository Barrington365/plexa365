import {createHash} from 'node:crypto';
import {getStore} from '@netlify/blobs';
import {requireAdmin} from '@/app/lib/auth/guards';
import {shouldUseNetlifyBlobStore} from '@/app/lib/netlify-blob-json';
import {isWorkspaceSameOrigin} from '@/app/lib/studio-workspace/origin';
import {hostedWorkspace} from '@/app/lib/studio-workspace/store';
import {importLegacyAsset, loadLegacyInventory, normaliseLegacyRel} from '@/features/msn-local/legacy-library-import.mjs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function blobStore(name: string) {
  return getStore({name, consistency: 'strong'});
}

async function list(sourceStore: string, prefix: string) {
  try {
    const out: {rel: string; sourceUpdatedAt: string | null}[] = [];
    for await (const page of blobStore(sourceStore).list({prefix, paginate: true})) {
      for (const blob of page.blobs) out.push({rel: blob.key, sourceUpdatedAt: null});
    }
    return out;
  } catch {
    return [];
  }
}

async function readJson(sourceStore: string, key: string) {
  try {
    return await blobStore(sourceStore).get(key, {type: 'json'});
  } catch {
    return null;
  }
}

async function readSource(sourceStore: string, rel: string) {
  const result = await blobStore(sourceStore).getWithMetadata(rel, {type: 'arrayBuffer'});
  if (!result?.data) return null;
  const updatedAt = result.metadata?.updatedAt;
  return {
    bytes: Buffer.from(result.data),
    sourceUpdatedAt: typeof updatedAt === 'string' ? updatedAt : null,
  };
}

async function inventory() {
  return loadLegacyInventory({list, readJson, voiceRels: []});
}

function guard(request: Request) {
  if (!isWorkspaceSameOrigin(request)) return Response.json({error: 'Same-origin request required'}, {status: 403});
  if (!shouldUseNetlifyBlobStore()) return Response.json({error: 'Library inventory is available on the hosted Studio.'}, {status: 503});
  return null;
}

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const denied = guard(request);
  if (denied) return denied;
  const listed = await inventory();
  const workspace = hostedWorkspace();
  const state = (await workspace.snapshot()).state;
  const keys = Object.keys(state.assets || {});
  return Response.json({
    inventoriedAt: new Date().toISOString(),
    files: listed.files,
    unavailable: listed.unavailable,
    workspace: {
      total: keys.length,
      legacy: keys.filter(key => key.startsWith('legacy-library/')).length,
      other: keys.filter(key => !key.startsWith('legacy-library/')).length,
    },
  }, {headers: {'Cache-Control': 'no-store'}});
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request);
  if ('response' in auth) return auth.response;
  const denied = guard(request);
  if (denied) return denied;
  const body = await request.json().catch(() => null);
  const action = body?.action;
  const rel = normaliseLegacyRel(body?.rel);
  if ((action !== 'inspect' && action !== 'copy') || !rel) return Response.json({error: 'Choose one inventoried library file'}, {status: 400});
  const listed = await inventory();
  const file = listed.files.find(item => item.rel === rel);
  const missing = listed.unavailable.find(item => item.rel === rel);
  if (!file) return Response.json(missing ? {decision: 'unavailable', ...missing} : {error: 'That file is not in the old library inventory'}, {status: missing ? 200 : 404});
  const source = await readSource(file.sourceStore, file.rel);
  if (!source) return Response.json({decision: 'unavailable', rel: file.rel, tab: file.tab, sourceStore: file.sourceStore, reason: 'Bytes are not in a durable store'});
  const sha256 = createHash('sha256').update(source.bytes).digest('hex');
  if (action === 'inspect') {
    return Response.json({
      decision: 'inspected',
      rel: file.rel,
      tab: file.tab,
      sourceStore: file.sourceStore,
      name: file.name,
      bytes: source.bytes.length,
      sha256,
      sourceUpdatedAt: source.sourceUpdatedAt || file.sourceUpdatedAt,
    }, {headers: {'Cache-Control': 'no-store'}});
  }
  const copied = await importLegacyAsset(hostedWorkspace(), {
    ...file,
    bytes: source.bytes,
    sourceUpdatedAt: source.sourceUpdatedAt || file.sourceUpdatedAt,
  });
  return Response.json({...copied, tab: file.tab, name: file.name}, {headers: {'Cache-Control': 'no-store'}});
}
