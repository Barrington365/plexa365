import {GET as readWorkspace,POST as writeWorkspace} from '@/app/api/studio-workspace/[...path]/route';
export const runtime='nodejs';export const dynamic='force-dynamic';
const context=()=>({params:Promise.resolve({path:['brand-kits']})});
export function GET(request:Request){return readWorkspace(request,context());}
export function POST(request:Request){return writeWorkspace(request,context());}
