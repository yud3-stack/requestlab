import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { request } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));

let child: ChildProcess | undefined;

afterEach(async () => {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolveExit) => child?.once("exit", () => resolveExit()));
  child = undefined;
});

describe("production startup", () => {
  it("keeps the compiled server alive and serves health", async () => {
    const port = await getFreePort();
    child = spawn(process.execPath, [resolve(appRoot, "dist/server.js")], {
      cwd: appRoot,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(port),
        REQUESTLAB_API_URL: "",
        REQUESTLAB_API_KEY: "",
        DEMO_TRIGGER_SECRET: "startup-test-secret"
      },
      stdio: "ignore"
    });

    await waitForHealth(port, child);
    expect(child.exitCode).toBeNull();
  }, 15_000);
});

async function getFreePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string")
        return reject(new Error("Port allocation failed"));
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

async function waitForHealth(port: number, process: ChildProcess): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null)
      throw new Error("Demo API exited before health became available");
    try {
      const status = await getStatus(port);
      if (status === 200) return;
    } catch {
      // The server may still be binding its port.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Demo API health check timed out");
}

async function getStatus(port: number): Promise<number> {
  return await new Promise((resolveStatus, reject) => {
    const req = request({ host: "127.0.0.1", port, path: "/health", method: "GET" }, (response) => {
      response.resume();
      response.once("end", () => resolveStatus(response.statusCode ?? 0));
    });
    req.once("error", reject);
    req.end();
  });
}
