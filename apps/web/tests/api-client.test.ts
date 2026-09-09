import { describe, expect, it } from "vitest";
import { getRequestHeaders } from "../src/api";

describe("frontend development identity", () => {
  it("sends the development user header when configured", () => {
    expect(getRequestHeaders("seed-user-id")).toEqual({
      "x-requestlab-user-id": "seed-user-id"
    });
  });

  it("does not send an identity header when it is not configured", () => {
    expect(getRequestHeaders(undefined)).toBeUndefined();
  });
});
