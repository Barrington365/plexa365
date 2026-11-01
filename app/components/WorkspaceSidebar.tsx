"use client";
import { useEffect } from "react";

/** Use the same navigation as the authenticated Studio workspace. */
export function WorkspaceSidebar() {
  useEffect(() => {
    let disposed = false;
    let script: HTMLScriptElement | undefined;
    void fetch('/api/auth/me', { credentials: 'include' })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (disposed || !['admin', 'editor', 'viewer'].includes(data?.user?.role)) return;
        script = document.createElement('script');
        script.src = '/workspace/studio-navigation.js';
        document.body.append(script);
      }).catch(() => {});
    return () => { disposed = true; script?.remove(); };
  }, []);
  return null;
}
