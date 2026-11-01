import {requireUser} from '../../app/lib/auth/guards';
import {hostedWorkspace} from '../../app/lib/studio-workspace/store';
import {workspaceWrite} from '../../features/msn-local/workspace-api.mjs';

export default async (request: Request) => {
  if (request.method !== 'POST') return new Response(null, {status: 405});
  const auth = await requireUser(request);
  if ('response' in auth) return auth.response;
  if (!['admin', 'editor'].includes(auth.user.role)) return Response.json({error: 'Editor access required.'}, {status: 403});
  const body = await request.json().catch(() => null);
  const action = body?.action;
  if (!['capture', 'suggest', 'ensure'].includes(action)) return Response.json({error: 'Choose a thumbnail action'}, {status: 400});
  try {
    return Response.json(await workspaceWrite(hostedWorkspace(), 'thumbnails/' + action, body));
  } catch (error) {
    return Response.json({error: error instanceof Error ? error.message : 'Could not save the thumbnail'}, {status: 400});
  }
};
