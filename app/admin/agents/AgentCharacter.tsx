"use client";
import {useState} from "react";

const agents = new Set(["bob", "fiddle", "james", "hubble", "linnaeus", "banach", "halley", "huygens"]);
/** Presentation only: no agent commands, provider requests or permission changes. */
export function AgentCharacter({name, id, large = false}: {name: string; id: string; large?: boolean}) {
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const size = large ? 160 : 72;
  const base = `/agents/${id}`;
  const animated = large && !paused;
  const src = `${base}/${animated ? "idle.webp" : "still.png"}`;
  if (!agents.has(id) || failed === `${base}/still.png`) {
    return <span role="img" aria-label={`${name} character unavailable`} className="flex shrink-0 items-center justify-center rounded-full bg-[color:var(--surface-muted)] text-2xl font-bold" style={{width:size,height:size}}>{name.slice(0,1)}</span>;
  }
  return <div className="shrink-0 text-center" style={{width:size}}>
    <picture>
      <source media="(prefers-reduced-motion: reduce)" srcSet={`${base}/still.png`} />
      {/* Preserve the supplied animation; Next image optimisation would flatten it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={failed === src ? `${base}/still.png` : src} alt={`${name} character`} width={size} height={size} className="object-contain" loading={large ? "eager" : "lazy"} onError={event => setFailed(new URL(event.currentTarget.currentSrc).pathname)} />
    </picture>
    {large && <button type="button" aria-pressed={paused} onClick={() => setPaused(value => !value)} className="mt-2 rounded-lg border border-[color:var(--border)] px-2 py-1 text-xs motion-reduce:hidden">{paused ? "Play animation" : "Pause animation"}</button>}
  </div>;
}
