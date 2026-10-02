import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
for (const name of [".env", ".env.local"]) {
  const envPath = path.join(projectRoot, name);
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const connectionString = process.env.SUPABASE_DB_URL;
if (!apiUrl || !connectionString) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_DB_URL are required for migration setup.");
}

const apiHost = new URL(apiUrl).hostname;
if (!apiHost.endsWith(".supabase.co")) {
  throw new Error("The configured Supabase API URL does not contain a standard project reference.");
}
const projectRef = apiHost.split(".")[0];
const databaseUrl = new URL(connectionString);
if (!databaseUrl.protocol.startsWith("postgres")) {
  throw new Error("SUPABASE_DB_URL must be a PostgreSQL URI.");
}

const user = decodeURIComponent(databaseUrl.username);
const directHost = `db.${projectRef}.supabase.co`;
const poolerHost = databaseUrl.hostname.endsWith(".pooler.supabase.com");
if (databaseUrl.hostname !== directHost && !(poolerHost && user.endsWith(`.${projectRef}`))) {
  throw new Error("Database connection does not match NEXT_PUBLIC_SUPABASE_URL project reference.");
}

const dbEnv = { ...process.env };
delete dbEnv.PGSERVICE;
delete dbEnv.PGSERVICEFILE;
dbEnv.PGPASSWORD = decodeURIComponent(databaseUrl.password);
dbEnv.PGSSLMODE = "require";
dbEnv.PGCONNECT_TIMEOUT = "10";

const psql = process.platform === "win32" ? "psql.exe" : "psql";
const commonArgs = [
  "-X", "-w", "-v", "ON_ERROR_STOP=1",
  "-h", databaseUrl.hostname,
  "-p", databaseUrl.port || "5432",
  "-U", user,
  "-d", decodeURIComponent(databaseUrl.pathname.slice(1)) || "postgres",
];
const run = (args) => execFileSync(psql, [...commonArgs, ...args], {
  cwd: projectRoot,
  env: dbEnv,
  encoding: "utf8",
  windowsHide: true,
  timeout: 90_000,
}).trim();

const existing = Number(run([
  "-At", "-c",
  "select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname in ('products','cart_items','orders') and c.relkind in ('r','p')",
]));
if (!Number.isInteger(existing) || existing !== 0) {
  throw new Error(`Found ${existing} existing shop table(s); initial migrations require an empty shop schema.`);
}
console.log("Connected to the configured Supabase project; no existing shop tables found.");

for (const file of [
  "supabase/migrations/202609300001_shop_schema.sql",
  "supabase/migrations/202609300002_order_operations.sql",
  "supabase/migrations/202610020001_delivery_details.sql",
  "supabase/seed.sql",
]) {
  run(["-q", "-f", path.join(projectRoot, file)]);
  console.log(`Applied ${file}`);
}

const summary = run([
  "-At", "-c",
  "select (select count(*) from public.products), (select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('products','cart_items','orders') and c.relrowsecurity), (select count(distinct p.proname) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('create_order_snapshot','finalize_paid_order','claim_order_email','complete_order_email'))",
]);
const [products, rlsTables, operations] = summary.split("|").map(Number);
if (products !== 6 || rlsTables !== 3 || operations !== 4) {
  throw new Error(`Post-migration verification failed: products=${products}, RLS tables=${rlsTables}, operations=${operations}.`);
}
console.log("Verified six products, RLS on three tables, and four order/email operations.");
