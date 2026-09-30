import { execFile } from "node:child_process";
import { access, mkdtemp, readdir, readFile, realpath, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const temporaryPrefix = "cohort-shop-db-";
const trace = (stage) => {
  if (process.env.SHOP_DB_TRACE === "1") process.stderr.write(`[shop-db] ${stage}\n`);
};

function run(file, args, options = {}) {
  const { input, ...rest } = options;
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, {
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
      ...rest,
    }, (error, stdout, stderr) => {
      if (error) {
        error.message = `${path.basename(file)} failed: ${stderr.trim() || error.message}`;
        reject(error);
      } else {
        resolve(stdout.trim());
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

async function findBinaries() {
  const suffix = process.platform === "win32" ? ".exe" : "";
  const candidates = [process.env.SHOP_PG_BIN];
  if (process.platform === "win32") {
    candidates.push("C:/Program Files/PostgreSQL/16/bin");
  }
  try {
    candidates.push(await run(`pg_config${suffix}`, ["--bindir"]));
  } catch {
    // A custom directory or the platform fallback may still contain the server.
  }
  for (const directory of candidates.filter(Boolean)) {
    try {
      await Promise.all(["initdb", "pg_ctl", "psql"].map((name) => access(path.join(directory, `${name}${suffix}`))));
      return Object.fromEntries(["initdb", "pg_ctl", "psql"].map((name) => [name, path.join(directory, `${name}${suffix}`)]));
    } catch {
      // Continue looking; a client-only PostgreSQL installation is insufficient.
    }
  }
  throw new Error("Database tests require PostgreSQL server binaries (initdb, pg_ctl, psql). Install PostgreSQL and set SHOP_PG_BIN to its bin directory.");
}

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

// This deliberately models only the Supabase database interfaces needed by the
// migrations. It does not simulate GoTrue, PostgREST, Google, or any provider.
const bootstrap = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text UNIQUE);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
  REVOKE CREATE ON SCHEMA public FROM PUBLIC;
`;

export async function startDatabase() {
  const binaries = await findBinaries();
  const temporaryRoot = await realpath(tmpdir());
  const directory = await mkdtemp(path.join(temporaryRoot, temporaryPrefix));
  const data = path.join(directory, "data");
  const log = path.join(directory, "postgres.log");
  const port = await unusedPort();
  let started = false;
  const env = {
    ...process.env,
    PGHOST: "127.0.0.1",
    PGPORT: String(port),
    PGUSER: "postgres",
    PGDATABASE: "postgres",
    PGCONNECT_TIMEOUT: "10",
    PGSSLMODE: "disable",
    PGOPTIONS: "",
  };
  delete env.PGSERVICE;
  delete env.PGSERVICEFILE;

  const sql = (input) => run(binaries.psql, ["-X", "-q", "-A", "-t", "-w", "-v", "ON_ERROR_STOP=1"], { env, input });
  const as = (role, user, input) => {
    if (!["anon", "authenticated", "service_role"].includes(role)) throw new Error("Unknown test role");
    if (user && !/^[a-f0-9-]{36}$/i.test(user)) throw new Error("Invalid test identity");
    return sql(`BEGIN; SET LOCAL ROLE ${role}; SET LOCAL "request.jwt.claim.sub" = '${user ?? ""}'; ${input}; COMMIT;`);
  };

  const stop = async () => {
    if (started) {
      await run(binaries.pg_ctl, ["-D", data, "-w", "-t", "20", "-m", "immediate", "stop"]);
      started = false;
    }
    // Never remove a database supplied by the user: this path must be the exact
    // new directory created above, directly beneath the resolved OS temp root.
    const resolved = await realpath(directory);
    if (path.dirname(resolved) !== temporaryRoot || !path.basename(resolved).startsWith(temporaryPrefix)) {
      throw new Error(`Refusing to remove unexpected database test directory: ${resolved}`);
    }
    await rm(resolved, { recursive: true, force: false });
  };

  try {
    trace("initializing isolated PostgreSQL");
    await run(binaries.initdb, ["-D", data, "--username=postgres", "--auth=trust", "--encoding=UTF8", "--locale=C", "--no-instructions"]);
    trace("starting isolated PostgreSQL");
    await run(binaries.pg_ctl, ["-D", data, "-l", log, "-w", "-t", "30", "-o", `-h 127.0.0.1 -p ${port} -F -c max_connections=30`, "start"]);
    started = true;
    trace("applying Supabase auth/role bootstrap");
    await sql(bootstrap);
    const migrations = (await readdir(path.join(root, "supabase/migrations"))).filter((file) => file.endsWith(".sql")).sort();
    if (!migrations.length) throw new Error("No SQL migrations found");
    for (const file of migrations) {
      trace(`applying ${file}`);
      await sql(await readFile(path.join(root, "supabase/migrations", file), "utf8"));
    }
    trace("seeding products");
    await sql(await readFile(path.join(root, "supabase/seed.sql"), "utf8"));
    trace("ready");
    return { sql, as, stop, root, env, port };
  } catch (error) {
    try {
      await stop();
    } catch (cleanupError) {
      error.message += `\nCleanup failed: ${cleanupError.message}\nTemporary directory: ${directory}`;
    }
    throw error;
  }
}
