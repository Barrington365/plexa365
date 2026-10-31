"use client";
import { useState } from 'react';
import type { Command } from '@/app/lib/agents/model';
export function ApproveAgentTask({proposal}:{proposal:{command:Command;version:number}}){
 const [status,setStatus]=useState(''),[busy,setBusy]=useState(false),[saved,setSaved]=useState(false),[dismissed,setDismissed]=useState(false);
 async function approve(){setBusy(true);try{const r=await fetch('/api/admin/agents',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(proposal)});const d=await r.json();if(!r.ok)throw new Error(d.error);setSaved(true);setStatus('Task saved as paused. No execution started.');}catch(e){setStatus(e instanceof Error?e.message:'Save failed.');}finally{setBusy(false);}}
 return <section className="my-3 rounded-xl border p-3"><h3 className="font-bold">Review proposed task</h3><dl className="my-3 space-y-1 text-sm">{Object.entries(proposal.command).filter(([k])=>k!=='action').map(([k,v])=><div key={k}><dt className="inline font-semibold capitalize">{k}: </dt><dd className="inline break-words">{String(v)}</dd></div>)}</dl>{!saved&&!dismissed&&<div className="flex gap-3"><button disabled={busy} onClick={approve} className="rounded border px-3 py-2">Approve and save paused task</button><button disabled={busy} onClick={()=>{setDismissed(true);setStatus('Proposal dismissed. Nothing changed.');}}>Dismiss</button></div>}<p role="status">{status}</p></section>;
}
