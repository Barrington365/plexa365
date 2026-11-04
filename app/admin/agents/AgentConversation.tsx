"use client";
import {AgentCharacter} from './AgentCharacter';
/** The shared companion owns presentation; existing records and tools stay unchanged. */
export function AgentConversation({agent}:{agent:{id:string;name:string;responsibility:string};busy:boolean;onSend:(note:string)=>Promise<boolean>}){
 const open=()=>window.dispatchEvent(new CustomEvent('plexa:agent-open',{detail:{id:agent.id}}));
 return <section className="rounded-2xl border p-4"><AgentCharacter id={agent.id} name={agent.name} onOpen={open}/><h2 className="font-bold">{agent.name}</h2><p>{agent.responsibility}</p><button className="mt-3 rounded-xl border px-4 py-2" onClick={open}>Open floating companion</button><p className="mt-2 text-sm">Opening the character does not activate its tools.</p></section>;
}
