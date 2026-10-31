"use client";
import { useState } from "react";
export function AgentArtwork({id,name}:{id:string;name:string}) {
 const [playing,setPlaying]=useState(true);
 return <div className="mb-4 flex items-center gap-4">
  <picture>
   <source media="(prefers-reduced-motion: reduce)" srcSet={`/agents/${id}/still.png`}/>
   {/* Animated images must bypass static image optimization. */}
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img src={`/agents/${id}/${playing?'idle.webp':'still.png'}`} alt={`${name} agent character`} width={112} height={112} loading="lazy" className="h-28 w-28 object-contain"/>
  </picture>
  <button type="button" onClick={()=>setPlaying(!playing)} aria-pressed={playing} className="text-xs underline motion-reduce:hidden">{playing?'Pause animation':'Play animation'}</button>
 </div>;
}
