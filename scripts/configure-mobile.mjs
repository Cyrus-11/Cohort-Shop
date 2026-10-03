import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
const root = process.cwd();
for (const name of [".env", ".env.local"]) if (existsSync(path.join(root, name))) process.loadEnvFile(path.join(root, name));
const destination = path.join(root, "mobile/.env.local");
if (existsSync(destination)) throw new Error("mobile/.env.local already exists; edit it directly to preserve its settings.");
const values = {
  EXPO_PUBLIC_API_URL: process.env.APP_URL,
  EXPO_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};
if (Object.values(values).some(value => !value)) throw new Error("Configure the website's public Supabase settings and APP_URL first.");
writeFileSync(destination, Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { flag: "wx" });
console.log("Created ignored mobile/.env.local using only the three public app settings. No server credentials copied.");
