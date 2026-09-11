import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_DEMO_SCENARIO_TIMEOUT_MS,
  MAX_DEMO_SCENARIO_TIMEOUT_MS,
  loadConfig
} from "../src/config/index.js";

afterEach(() => vi.unstubAllEnvs());

describe("demo scenario timeout config", () => {
  it("defaults to 45 seconds", () => {
    vi.stubEnv("DEMO_SCENARIO_TIMEOUT_MS", undefined);
    expect(loadConfig().demoScenarioTimeoutMs).toBe(DEFAULT_DEMO_SCENARIO_TIMEOUT_MS);
  });

  it("caps configured timeouts at 60 seconds", () => {
    vi.stubEnv("DEMO_SCENARIO_TIMEOUT_MS", "90000");
    expect(loadConfig().demoScenarioTimeoutMs).toBe(MAX_DEMO_SCENARIO_TIMEOUT_MS);
  });
});
