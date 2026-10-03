"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { subscribeToCart } from "@/lib/cart-sync";

// Refresh server-owned account data without replacing the page or scroll position.
export function AccountSync({ userId }: { userId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const busy = useRef(pending);
  const queued = useRef(false);
  useEffect(() => {
    busy.current = pending;
    if (!pending && queued.current && document.visibilityState === "visible" && navigator.onLine) {
      queued.current = false;
      startTransition(() => router.refresh());
    }
  }, [pending, router]);

  useEffect(() => {
    function refresh() {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if (busy.current) { queued.current = true; return; }
      startTransition(() => router.refresh());
    }

    const timer = window.setInterval(refresh, 10_000);
    const unsubscribe = subscribeToCart(createClient(), userId, refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      unsubscribe();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, userId]);

  return null;
}
