import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const tsxCli = resolve(root, "node_modules/tsx/dist/cli.mjs");
const entrypoint = resolve(root, "scripts/demo-cleanup-health-cli.mts");

describe("demo health cleanup CLI", () => {
  it.each(["", "*"])(
    "handles an invalid project slug without importing errors or DB queries",
    async (slug) => {
      const result = await runCli(slug);

      expect(result.code).toBe(1);
      expect(result.output).not.toContain("ERR_PACKAGE_PATH_NOT_EXPORTED");
      expect(result.output).toContain("DEMO_PROJECT_SLUG must identify one explicit project");
    }
  );
});

function runCli(slug: string): Promise<{ code: number | null; output: string }> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [tsxCli, entrypoint], {
      cwd: root,
      env: {
        PATH: process.env.PATH ?? "",
        PATHEXT: process.env.PATHEXT ?? "",
        SystemRoot: process.env.SystemRoot ?? "",
        TEMP: process.env.TEMP ?? "",
        TMP: process.env.TMP ?? "",
        DEMO_PROJECT_SLUG: slug,
        DATABASE_URL: "postgresql://127.0.0.1:1/requestlab-test"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
    child.once("error", reject);
    child.once("exit", (code) => resolveResult({ code, output }));
  });
}
