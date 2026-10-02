// Module hooks for app tests: resolve the "@/" alias to src/*.ts and swap the
// database client and Mailgun sender for in-memory fakes. No network, payment, or email.
const root = new URL("../", import.meta.url);
const fakes = {
  "mailgun.js": new URL("./fakes/mailgun-sdk.mjs", import.meta.url).href,
  // Next.js supplies this marker at build time; it has no runtime behaviour.
  "server-only": "data:text/javascript,export {}",
  "@/lib/supabase/admin": new URL("./fakes/admin.mjs", import.meta.url).href,
  "@/lib/mailgun": new URL("./fakes/mailgun.mjs", import.meta.url).href,
};

export async function resolve(specifier, context, nextResolve) {
  if (fakes[specifier]) return { url: fakes[specifier], shortCircuit: true };
  if (specifier === "next/server") return nextResolve("next/server.js", context);
  if (specifier.startsWith("@/")) {
    return nextResolve(new URL(`src/${specifier.slice(2)}.ts`, root).href, context);
  }
  return nextResolve(specifier, context);
}
