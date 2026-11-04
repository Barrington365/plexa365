"use client";
import Script from 'next/script';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
export function AgentCompanion(){
 const pathname=usePathname();
 useEffect(()=>{window.dispatchEvent(new Event('plexa:route'));},[pathname]);
 return <Script src="/agents/companion.js" strategy="afterInteractive"/>;
}
