import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const required = [
  "vercel.json",
  "render.yaml",
  ".env.example",
  "apps/web/.env.example",
  "docs/deployment.md"
];
const failures = [];
for (const file of required) if (!existsSync(join(root, file))) failures.push(`${file}: missing`);
const rootEnv = readFileSync(join(root, ".env.example"), "utf8");
const webEnv = readFileSync(join(root, "apps/web/.env.example"), "utf8");
for (const name of [
  "DATABASE_URL",
  "DIRECT_URL",
  "REDIS_URL",
  "DEMO_SESSION_SECRET",
  "DEMO_TRIGGER_SECRET"
]) {
  if (!rootEnv.includes(name)) failures.push(`${name}: undocumented`);
}
for (const name of ["VITE_REQUESTLAB_API_URL", "VITE_REQUESTLAB_DEMO_API_URL", "VITE_DEMO_MODE"]) {
  if (!webEnv.includes(name)) failures.push(`${name}: undocumented`);
}
if (rootEnv.includes("rlk_local_development_only") || rootEnv.includes("requestlab_dev"))
  failures.push(".env.example: secret-like default");
const vercel = readFileSync(join(root, "vercel.json"), "utf8");
const render = readFileSync(join(root, "render.yaml"), "utf8");
if (
  !vercel.includes("apps/web/dist") ||
  !vercel.includes("connect-src 'self' https://api.requestlab.yusufdere.com")
)
  failures.push("vercel.json: invalid SPA/output/CSP configuration");
if ((render.match(/^  - type: web/gm) ?? []).length !== 2)
  failures.push("render.yaml: expected exactly two web services");
if (render.includes('ALLOW_PRIVATE_REPLAY_TARGETS\n        value: "true"'))
  failures.push("render.yaml: private replay is enabled");
if (render.includes('CORS_ALLOWED_ORIGINS\n        value: "*"'))
  failures.push("render.yaml: wildcard CORS");
const sourceFiles = ["apps/api/src", "apps/demo-api/src", "apps/worker/src"].flatMap((dir) =>
  walk(join(root, dir))
);
for (const file of sourceFiles) {
  const text = readFileSync(file, "utf8");
  if (text.includes("console.log(process.env") || text.includes("console.error(process.env"))
    failures.push(`${file}: possible secret logging`);
}
try {
  const run = (args) => {
    if (process.platform === "win32")
      execFileSync(
        process.env.ComSpec || "cmd.exe",
        ["/d", "/s", "/c", "corepack", "pnpm", ...args],
        { cwd: root, stdio: "ignore" }
      );
    else execFileSync("corepack", ["pnpm", ...args], { cwd: root, stdio: "ignore" });
  };
  run(["--filter", "@requestlab/web", "build"]);
  run(["--filter", "@requestlab/api...", "build"]);
  run(["--filter", "@requestlab/demo-api...", "build"]);
} catch {
  failures.push("workspace production build failed");
}
const bundle = existsSync(join(root, "apps/web/dist"))
  ? walk(join(root, "apps/web/dist"))
      .filter((file) => /\.(js|css|html)$/.test(file))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n")
  : "";
for (const name of [
  "DATABASE_URL",
  "DIRECT_URL",
  "REDIS_URL",
  "DEMO_SESSION_SECRET",
  "DEMO_TRIGGER_SECRET",
  "REQUESTLAB_API_KEY"
])
  if (bundle.includes(name)) failures.push(`frontend bundle: ${name}`);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("deploy-check: passed");
}

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}
