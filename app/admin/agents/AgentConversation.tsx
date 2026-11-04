"use client";
import {useEffect, useRef, useState, type FormEvent} from "react";
import {createPortal} from "react-dom";
import {AgentCharacter} from "./AgentCharacter";

type Props = {agent: {id:string; name:string; responsibility:string; dialogue?:{at:string;from:string;text:string}[]}; busy:boolean; onSend:(note:string)=>Promise<boolean>};
/** A display window, never an execution or permission boundary. */
export function AgentConversation({agent,busy,onSend}:Props) {
  const popup = useRef<Window|null>(null);
  const [host,setHost]=useState<HTMLElement|null>(null);
  const [draft,setDraft]=useState("");
  const [feedback,setFeedback]=useState("");
  const [reaction,setReaction]=useState<"idle"|"thinking"|"success">("idle");
  useEffect(()=>{if(reaction!=="success")return;const timer=setTimeout(()=>setReaction("idle"),2500);return()=>clearTimeout(timer);},[reaction]);
  useEffect(()=>{const close=()=>popup.current?.close();window.addEventListener("pagehide",close);return()=>{window.removeEventListener("pagehide",close);close();};},[]);
  useEffect(()=>{if(!host)return;const timer=setInterval(()=>{if(popup.current?.closed){popup.current=null;setHost(null);}},300);return()=>clearInterval(timer);},[host]);
  function dock(){popup.current?.close();popup.current=null;setHost(null);}
  function detach(){
    if(popup.current&&!popup.current.closed){popup.current.focus();return;}
    const win=window.open("","_blank","popup,width=520,height=720,resizable=yes,scrollbars=yes");
    if(!win){setFeedback("Your browser blocked the pop-out. Allow pop-ups for Plexa, then try again.");return;}
    popup.current=win;
    win.document.title=`${agent.name} · Plexa`;
    win.document.head.replaceChildren();win.document.body.replaceChildren();
    const base=win.document.createElement("base");base.href=window.location.origin;win.document.head.append(base);
    document.querySelectorAll('link[rel="stylesheet"],style').forEach(node=>win.document.head.append(node.cloneNode(true)));
    for(const attr of Array.from(document.documentElement.attributes))win.document.documentElement.setAttribute(attr.name,attr.value);
    win.document.body.className=document.body.className;
    win.document.body.style.cssText="margin:0;padding:16px;background:var(--surface,#fff);color:var(--text-primary,#182239)";
    const root=win.document.createElement("main");win.document.body.append(root);setHost(root);setFeedback("");
  }
  async function submit(event:FormEvent){
    event.preventDefault();if(busy||!draft.trim())return;
    setReaction("thinking");setFeedback("Sending message…");
    try {if(await onSend(draft.trim())){setDraft("");setReaction("success");setFeedback("Message saved. Agent tools remain paused.");}
      else {setReaction("idle");setFeedback("Message could not be saved. Your draft has been kept; check the main page for details.");}}
    catch {setReaction("idle");setFeedback("Message could not be saved. Please try again.");}
  }
  const content=<section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5" aria-label={`${agent.name} conversation`}>
    <div className="mb-3 flex justify-end"><button type="button" onClick={host?dock:detach} className="rounded-lg border border-[color:var(--border)] px-3 py-2">{host?"Return to page":"Pop out ↗"}</button></div>
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center"><AgentCharacter name={agent.name} id={agent.id} large reaction={reaction} onOpen={host?undefined:detach}/><div><h2 className="text-2xl font-black">{agent.name}</h2><p>{agent.responsibility}</p><p className="text-sm text-[color:var(--text-secondary)]">Agent tools paused · Character reactions only</p></div></div>
    <div className="mt-4 max-h-80 space-y-3 overflow-auto" aria-live="polite">{agent.dialogue?.length?agent.dialogue.map((line,i)=><p key={`${line.at}-${i}`} className="p-3"><strong>{line.from==="agent"?agent.name:"You"}</strong><span className="mt-1 block whitespace-pre-wrap">{line.text}</span></p>):<p className="text-sm">Ask {agent.name} something. The agent stays paused.</p>}</div>
    <form onSubmit={submit} className="mt-4 grid gap-2"><label>Message {agent.name}<textarea value={draft} onChange={e=>setDraft(e.target.value)} required maxLength={2000} className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] p-2"/></label><button disabled={busy||reaction==="thinking"} className="rounded-xl bg-[color:var(--accent)] px-4 py-2 font-bold text-white">Send</button></form>
    {feedback&&<p role="status" className="mt-2 text-sm">{feedback}</p>}
  </section>;
  return host?<><div className="rounded-xl border p-4">{agent.name} is in a separate window. Keep this page open. <button className="underline" onClick={()=>popup.current?.focus()}>Show window</button> · <button className="underline" onClick={dock}>Return to page</button></div>{createPortal(content,host)}</>:content;
}
