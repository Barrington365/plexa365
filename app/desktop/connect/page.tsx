'use client';
import {useState} from 'react';
export default function DesktopConnect(){
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 async function approve(){setBusy(true);try{
 const query=new URLSearchParams(location.search);
 const response=await fetch('/api/desktop/authorize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge:query.get('challenge'),state:query.get('state')})});
 if(!response.ok)throw Error('Could not approve this sign-in. Check your account or start again in the desktop app.');
 const result=await response.json();location.href=result.callback;setMessage('Return to Plexa Companion on your Mac.');
 }catch(e){setMessage(e instanceof Error?e.message:'Sign-in failed');}finally{setBusy(false);}}
 return <main className="mx-auto max-w-lg space-y-5 p-8"><h1 className="text-2xl font-bold">Connect Plexa Companion</h1><p>Connect the Mac app to your signed-in Plexa account for 12 hours. It can read your authorised agents and conversations and send chat messages. Your existing permissions still apply. Opening the app does not activate tools.</p><p>Only continue if you just started sign-in in the Plexa Mac app.</p><button className="rounded-xl bg-violet-600 px-5 py-3 text-white" disabled={busy} onClick={()=>void approve()}>{busy?'Connecting…':'Connect Mac app'}</button><p role="status">{message}</p></main>;
}
