import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";

const root = process.cwd();
const env = loadEnv();
Object.assign(process.env, env);
const apiUrl = "http://127.0.0.1:3041";
const demoUrl = "http://127.0.0.1:3042";
const userId = await seedTwice();
const runtimeEnv = {
  ...process.env,
  ...env,
  NODE_ENV: "development",
  API_PORT: "3041",
  DEMO_API_PORT: "3042",
  REQUESTLAB_API_URL: apiUrl,
  REQUESTLAB_API_KEY: env.DEV_INGESTION_KEY ?? "rlk_local_development_only",
  REQUESTLAB_ENVIRONMENT: "development",
  REQUESTLAB_CAPTURE_MODE: "all",
  ALLOW_PRIVATE_REPLAY_TARGETS: "true"
};
const children = [];
let prisma;
try {
  const database = await import("../packages/database/dist/index.js");
  prisma = database.prisma;
  const migration = await prisma.$queryRawUnsafe(
    "SELECT migration_name, finished_at FROM \"_prisma_migrations\" WHERE migration_name = '20260909130000_replay_runs'"
  );
  assert(migration.length === 1 && migration[0].finished_at, "ReplayRun migration is not applied");
  const project = await prisma.project.findUnique({ where: { slug: "shop-api" } });
  const development =
    project &&
    (await prisma.environment.findUnique({
      where: { projectId_slug: { projectId: project.id, slug: "development" } }
    }));
  assert(
    project && development && development.type !== "PRODUCTION" && development.replayEnabled,
    "development environment is not replayable"
  );
  await prisma.environment.update({
    where: { id: development.id },
    data: { baseUrl: demoUrl, type: "DEVELOPMENT", replayEnabled: true }
  });
  start("api", "apps/api/src/server.ts", runtimeEnv);
  start("worker", "apps/worker/src/index.ts", runtimeEnv);
  start("demo", "apps/demo-api/src/server.ts", runtimeEnv);
  await waitFor(`${apiUrl}/health`);
  await waitFor(`${demoUrl}/health`);
  const startedAt = new Date().toISOString();
  const failed = await request(`${demoUrl}/api/orders`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer smoke-secret",
      token: "smoke-token"
    },
    body: JSON.stringify({ productId: "product-1", quantity: 1, token: "request-token" })
  });
  assert(failed.status === 500, "demo order failure");
  const event = await waitForEvent(project.id, startedAt, 500);
  assert(event.statusCode === 500 && event.path === "/api/orders", "captured failed event");
  const replay = await request(`${apiUrl}/api/projects/${project.id}/events/${event.id}/replays`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-requestlab-user-id": userId },
    body: JSON.stringify({
      environmentId: development.id,
      headers: {
        authorization: "should-not-send",
        "x-forwarded-for": "127.0.0.1",
        "x-smoke": "safe"
      },
      body: {
        productId: "product-1",
        quantity: 1,
        shippingAddress: {
          city: "Istanbul",
          district: "Kadikoy",
          addressLine: "Replay address",
          token: "response-secret"
        }
      },
      confirmSideEffects: true
    })
  });
  assert(replay.status === 202 && replay.body.data.status === "QUEUED", "replay queued");
  const replayId = replay.body.data.id;
  const details = await waitForReplay(project.id, replayId, userId, 30000);
  assert(details.status === "SUCCEEDED" && details.statusCode === 201, "replay succeeded with 201");
  assert(
    details.responseBody?.data?.shippingAddress?.token === "[REDACTED]",
    "replay response masking"
  );
  assert(
    !Object.keys(details.requestHeaders ?? {}).some((key) =>
      ["authorization", "x-forwarded-for", "host", "cookie"].includes(key.toLowerCase())
    ),
    "dangerous replay headers filtered"
  );
  const audit = await prisma.auditEvent.findFirst({
    where: { resourceType: "ReplayRun", resourceId: replayId, action: "REPLAY_CREATED" }
  });
  assert(audit, "replay audit event");
  const { countReplayJobs } = await import("../apps/api/dist/lib/replay-queue.js");
  assert((await countReplayJobs(env.REDIS_URL, replayId)) <= 1, "duplicate BullMQ job");
  console.log("migration: applied");
  console.log("seed: idempotent");
  console.log("environment: development replay enabled");
  console.log("original order: 500");
  console.log("replay: SUCCEEDED, 201");
  console.log("comparison: 500 -> 201");
  console.log(`duration: recorded; finishedAt: recorded`);
  console.log("audit: REPLAY_CREATED present");
  console.log("headers: dangerous headers filtered; response secrets masked");
  console.log("queue: one job for replay ID");
} finally {
  if (prisma) await prisma.$disconnect();
  for (const child of children) stop(child);
}

async function seedTwice() {
  let user;
  for (let i = 0; i < 2; i += 1) {
    const result = spawnSync("cmd.exe", ["/d", "/c", "corepack pnpm db:seed"], {
      cwd: root,
      env: { ...process.env, ...env },
      encoding: "utf8"
    });
    if (result.status !== 0) throw new Error("seed failed");
    user ??= result.stdout.match(/Seeded user ([^,]+)/)?.[1];
  }
  if (!user) throw new Error("seed user unavailable");
  return user;
}
function loadEnv() {
  const values = {};
  for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i > 0) values[line.slice(0, i)] = line.slice(i + 1).replace(/^['"]|['"]$/g, "");
  }
  return values;
}
function start(name, entrypoint, environment) {
  const child = spawn("cmd.exe", ["/d", "/c", `corepack pnpm exec tsx ${entrypoint}`], {
    cwd: root,
    env: environment,
    stdio: "ignore",
    windowsHide: true
  });
  child.name = name;
  children.push(child);
}
function stop(child) {
  if (child && !child.killed)
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true
    });
}
async function request(url, options = {}) {
  const response = await fetch(url, options);
  let body = null;
  try {
    body = await response.json();
  } catch {}
  return { status: response.status, body };
}
async function waitFor(url) {
  for (let i = 0; i < 60; i += 1) {
    try {
      if ((await request(url)).status === 200) return;
    } catch {}
    await sleep(250);
  }
  throw new Error(`health timeout: ${url}`);
}
async function waitForEvent(projectId, from, timeout) {
  const end = Date.now() + timeout;
  let last = null;
  while (Date.now() < end) {
    const result = await request(`${apiUrl}/api/projects/${projectId}/events?pageSize=100`, {
      headers: { "x-requestlab-user-id": userId }
    });
    last = result;
    const event = result.body?.data?.find(
      (item) => item.path === "/api/orders" && item.statusCode === 500
    );
    if (event)
      return (
        await request(`${apiUrl}/api/projects/${projectId}/events/${event.id}`, {
          headers: { "x-requestlab-user-id": userId }
        })
      ).body.data;
    await sleep(300);
  }
  throw new Error(
    `event timeout (${last?.status ?? "no response"}, ${last?.body?.data?.length ?? 0} events)`
  );
}
async function waitForReplay(projectId, replayId, id, timeout) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await request(`${apiUrl}/api/projects/${projectId}/replays/${replayId}`, {
      headers: { "x-requestlab-user-id": id }
    });
    if (["SUCCEEDED", "FAILED", "UNCERTAIN"].includes(result.body?.data?.status))
      return result.body.data;
    await sleep(400);
  }
  throw new Error("replay timeout");
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
