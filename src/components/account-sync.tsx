"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

// Refresh server-owned account data without replacing the page or scroll position.
export function AccountSync() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function refresh() {
      if (document.visibilityState !== "visible" || !navigator.onLine || pending) return;
      startTransition(() => router.refresh());
    }

    const timer = window.setInterval(refresh, 10_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, pending]);

  return null;
}
