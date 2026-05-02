import { describe, it, expect } from "vitest";
import { runPipeline } from "./pipeline";

describe("pipeline", () => {
  it("module loads without throwing", () => {
    expect(typeof runPipeline).toBe("function");
  });
});
