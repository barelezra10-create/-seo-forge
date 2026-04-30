import { describe, it, expect, beforeAll } from "vitest";
import { embedText } from "./voyage";

const KEY = process.env.VOYAGE_API_KEY;

describe("embedText", () => {
  beforeAll(() => {
    if (!KEY) throw new Error("VOYAGE_API_KEY not set; cannot run test");
  });

  it("returns a 1024-dim vector for a string", async () => {
    const v = await embedText("How does an MCA work?", KEY!);
    expect(v).toHaveLength(1024);
    expect(typeof v[0]).toBe("number");
  });

  it("returns vectors for batched input", async () => {
    const vs = await embedText(["MCA basics", "Personal loan rates"], KEY!);
    expect(vs).toHaveLength(2);
    expect(vs[0]).toHaveLength(1024);
  });
});
