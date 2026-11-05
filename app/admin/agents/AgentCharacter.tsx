"use client";
import {useEffect, useState} from "react";

import eyeData from "../../../public/agents/eyes.json";

const agents = new Set(["bob", "fiddle", "james", "hubble", "linnaeus", "banach", "halley", "huygens"]);
/** Presentation only: no agent commands, provider requests or permission changes. */
export function AgentCharacter({name, id, large = false, reaction = "idle", onOpen}: {name: string; id: string; large?: boolean; reaction?: "idle"|"thinking"|"success"; onOpen?:()=>void}) {
  const [awake, setAwake] = useState(false);
  useEffect(()=>{
    const update=(event:Event)=>setAwake((event as CustomEvent).detail?.id===id);
    window.addEventListener('plexa:agent-state',update);
    window.dispatchEvent(new Event('plexa:agent-state-request'));
    return ()=>window.removeEventListener('plexa:agent-state',update);
  },[id]);
  const [eyeStylesReady, setEyeStylesReady] = useState(false);
  const candidate=eyeData[id as keyof typeof eyeData];
  const eyes=candidate && Number.isFinite(candidate.height) && candidate.height>0 && typeof candidate.skin==='string' && Array.isArray(candidate.eyes) && candidate.eyes.every(eye=>Array.isArray(eye)&&eye.length===4&&eye.every(Number.isFinite)) ? candidate : null;
  const [hovered, setHovered] = useState(false);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const size = large ? 160 : 72;
  const base = `/agents/${id}`;
  const animated = awake && large && !paused;
  const pose = reaction !== "idle" ? reaction : hovered ? "hover" : "idle";
  const reacting = animated && pose !== "idle";
  const src = `${base}/${reacting ? `${pose}.webp` : "still.png"}`;
  if (!agents.has(id) || failed === `${base}/still.png`) {
    return <span role="img" aria-label={`${name} character unavailable`} className="flex shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-muted)] text-2xl font-bold" style={{width:size,height:size}}>{name.slice(0,1)}</span>;
  }
  const artwork = <span className="plexa-eye-art" data-awake={awake} data-motion={!paused} data-reacting={reacting}>
    <link rel="stylesheet" href="/agents/eyes.css" onLoad={()=>setEyeStylesReady(true)} onError={()=>setEyeStylesReady(false)} />
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcSet={`${base}/still.png`} />
      {/* Preserve the supplied animation; Next image optimisation would flatten it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={failed === src ? `${base}/still.png` : src} alt={`${name} character, ${awake ? "awake" : "resting"}`} width={size} height={size} className="object-contain" loading={large ? "eager" : "lazy"} onError={event => setFailed(new URL(event.currentTarget.currentSrc).pathname)} />
    </picture>
    {eyes && eyeStylesReady && !failed && <svg className="plexa-eyelids" viewBox={`0 0 256 ${eyes.height}`} aria-hidden="true">{eyes.eyes.map(([x,y,w,h],i)=><g key={i}><rect x={x-1} y={y-1} width={w+2} height={h+2} rx="2" fill={eyes.skin}/><path d={`M ${x} ${y+h*.6} q ${w/2} 3 ${w} 0`} stroke="#30251c" strokeWidth="3" fill="none" strokeLinecap="round"/></g>)}</svg>}
    </span>;
  return <div className="shrink-0 text-center" style={{width:size}} onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)} onFocus={()=>setHovered(true)} onBlur={()=>setHovered(false)}>
    {onOpen ? <button type="button" onClick={onOpen} aria-label={`Pop out ${name}`} className="rounded-lg focus-visible:outline focus-visible:outline-2">{artwork}</button> : artwork}
    {large && <button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)} className="mt-2 rounded-lg border border-[color:var(--border)] px-2 py-1 text-xs motion-reduce:hidden">{paused ? "Play animation" : "Pause animation"}</button>}
  </div>;
}
