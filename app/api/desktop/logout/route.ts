import {revokeDesktop} from '@/app/lib/desktop/sessions';
export async function POST(request:Request){await revokeDesktop(request);return new Response(null,{status:204});}
