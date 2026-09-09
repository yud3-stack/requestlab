import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";

const root = process.cwd();
const env = loadEnv();
const apiUrl = "http://127.0.0.1:3011";
const demoUrl = "http://127.0.0.1:3012";
const seedResult = spawnSync("cmd.exe", ["/d", "/c", "corepack pnpm db:seed"], {
  cwd: root,
  env: { ...process.env, ...env },
  encoding: "utf8"
});
if (seedResult.status !== 0)
  throw new Error(`Seed failed (${seedResult.status ?? seedResult.error?.code ?? "unknown"})`);
const userId = env.DEV_USER_ID ?? seedResult.stdout.match(/Seeded user ([^,]+)/)?.[1];
const seedKey = env.DEV_INGESTION_KEY ?? "rlk_local_development_only";
const sdkKey = env.REQUESTLAB_API_KEY ?? seedKey;
const children = [];
process.on("exit", () => {
  for (const child of children) stop(child);
});
process.env.DATABASE_URL = env.DATABASE_URL;

if (!userId || !seedKey || !sdkKey) throw new Error("Required smoke-test environment is missing");
if (hash(seedKey) !== hash(sdkKey)) throw new Error("Seed and SDK API key hashes do not match");

const { prisma } = await import("../packages/database/dist/index.js");
const migrations = await prisma.$queryRawUnsafe(
  'SELECT "migration_name", "finished_at" FROM "_prisma_migrations" ORDER BY "started_at"'
);
await prisma.$disconnect();
if (!migrations.length || migrations.some((migration) => !migration.finished_at))
  throw new Error("Migration status is not current");
console.log("migration status: applied/current");

const runtimeEnv = {
  ...process.env,
  ...env,
  DEV_USER_ID: userId,
  DEV_INGESTION_KEY: seedKey,
  REQUESTLAB_API_URL: apiUrl,
  REQUESTLAB_API_KEY: sdkKey,
  REQUESTLAB_CAPTURE_MODE: "all",
  API_PORT: "3011",
  DEMO_API_PORT: "3012"
};
start("api", "apps/api/src/server.ts", runtimeEnv);
await waitFor(`${apiUrl}/health`);
const before = await request(`${apiUrl}/api/projects`, { headers: userHeaders() });
assert(before.status === 200, "project lookup");
const projectId = before.body.data.find((project) => project.slug === "shop-api")?.id;
assert(projectId, "seed project");
console.log("seed data: present");
console.log("seed/sdk key: present and SHA-256 equal");
start("demo", "apps/demo-api/src/server.ts", runtimeEnv);
await waitFor(`${demoUrl}/health`);

const startedAt = new Date().toISOString();
const scenarios = [
  [
    "GET /api/products",
    () => request(`${demoUrl}/api/products`, { headers: sensitiveHeaders() }),
    200
  ],
  [
    "POST /api/orders",
    () =>
      request(`${demoUrl}/api/orders`, {
        method: "POST",
        headers: { ...sensitiveHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ productId: "product-1", quantity: 1, token: "order-token" })
      }),
    500
  ],
  [
    "POST /api/auth/login",
    () =>
      request(`${demoUrl}/api/auth/login`, {
        method: "POST",
        headers: { ...sensitiveHeaders(), "content-type": "application/json" },
        body: JSON.stringify({ email: "wrong@example.com", password: "wrong-password" })
      }),
    401
  ],
  [
    "GET /api/demo/slow",
    () => request(`${demoUrl}/api/demo/slow?delayMs=1500`, { headers: sensitiveHeaders() }),
    200
  ]
];

for (const [name, runScenario, expected] of scenarios) {
  const response = await runScenario();
  assert(response.status === expected, `${name} expected ${expected}, got ${response.status}`);
  console.log(`${name}: ${response.status}`);
}

const list = await waitForEvents(projectId, startedAt, 5);
assert(list.length >= 5, "captured event count");
const details = [];
for (const event of list) {
  const detail = await request(`${apiUrl}/api/projects/${projectId}/events/${event.id}`, {
    headers: userHeaders()
  });
  assert(detail.status === 200, "event detail");
  details.push(detail.body.data);
}
console.log(
  `event timings: ${details.map((event) => `${event.path}=${event.durationMs ?? "null"}ms`).join(", ")}`
);
assert(
  details.some(
    (event) => event.method === "GET" && event.path === "/api/products" && event.statusCode === 200
  ),
  "products event"
);
assert(
  details.some(
    (event) => event.method === "POST" && event.path === "/api/orders" && event.statusCode === 500
  ),
  "order event"
);
assert(
  details.some(
    (event) =>
      event.method === "POST" && event.path === "/api/auth/login" && event.statusCode === 401
  ),
  "login event"
);
assert(
  details.some(
    (event) =>
      event.method === "GET" &&
      event.path === "/api/demo/slow" &&
      event.statusCode === 200 &&
      (event.durationMs ?? 0) >= 1000
  ),
  "slow event"
);
assert(
  details.every((event) => containsOnlyRedactedSecrets(event)),
  "event masking"
);
const productsEvent = details.find((event) => event.path === "/api/products");
const orderEvent = details.find(
  (event) => event.path === "/api/orders" && event.statusCode === 500
);
const loginEvent = details.find((event) => event.path === "/api/auth/login");
assert(productsEvent?.requestHeaders?.authorization === "[REDACTED]", "authorization masking");
assert(productsEvent?.requestHeaders?.token === "[REDACTED]", "header token masking");
assert(orderEvent?.requestBody?.token === "[REDACTED]", "body token masking");
assert(loginEvent?.requestBody?.password === "[REDACTED]", "password masking");
console.log(`Supabase events: ${details.length} new events verified`);
console.log("event detail: method/path/status/duration verified");
console.log("masking: password/token/authorization values are [REDACTED]");

stop(children[0]);
const failOpen = await request(`${demoUrl}/api/products`, { headers: sensitiveHeaders() });
assert(failOpen.status === 200, "demo response while RequestLab API is unavailable");
console.log("fail-open: demo API remained available while RequestLab API was unavailable");

for (const child of children) stop(child);

function loadEnv() {
  const values = {};
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator > 0)
      values[line.slice(0, separator)] = line.slice(separator + 1).replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function userHeaders() {
  return { "x-requestlab-user-id": userId };
}

function sensitiveHeaders() {
  return { authorization: "Bearer smoke-secret", token: "smoke-token" };
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function waitFor(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await request(url);
      if (response.status === 200) return;
    } catch {
      // Service is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForEvents(projectId, from, minimum) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const response = await request(
      `${apiUrl}/api/projects/${projectId}/events?pageSize=100&from=${encodeURIComponent(from)}`,
      {
        headers: userHeaders()
      }
    );
    if (response.status === 200 && response.body.data.length >= minimum) return response.body.data;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for SDK events");
}

function containsOnlyRedactedSecrets(value) {
  const serialized = JSON.stringify(value);
  return (
    !serialized.includes("smoke-secret") &&
    !serialized.includes("smoke-token") &&
    !serialized.includes("wrong-password")
  );
}

function start(name, entrypoint, runtimeEnvironment) {
  const child = spawn("cmd.exe", ["/d", "/c", `corepack pnpm exec tsx ${entrypoint}`], {
    cwd: root,
    env: runtimeEnvironment,
    stdio: "ignore",
    windowsHide: true
  });
  child.name = name;
  children.push(child);
  return child;
}

function stop(child) {
  if (!child || child.killed) return;
  spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
    stdio: "ignore",
    windowsHide: true
  });
}

function run(command, args, options) {
  const result = spawnSync(command, args, { ...options, cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} failed`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
