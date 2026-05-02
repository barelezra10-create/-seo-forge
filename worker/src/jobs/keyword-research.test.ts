import { describe, it, expect } from "vitest";
import { selectKeyword, type Candidate } from "./keyword-research";

describe("selectKeyword", () => {
  it("picks highest score among candidates not in coveredSlugs", () => {
    const candidates: Candidate[] = [
      { keyword: "what is an mca", source: "ahrefs", volume: 1000, kd: 5, position: null },
      { keyword: "mca rates", source: "ahrefs", volume: 500, kd: 10, position: null },
      { keyword: "mca defaults", source: "gsc", volume: 0, kd: 0, position: 12 },
    ];
    const picked = selectKeyword({
      candidates,
      coveredSlugs: new Set(["what-is-an-mca"]),
    });
    expect(picked?.keyword).toBe("mca rates");
  });

  it("returns null if no candidate available", () => {
    expect(selectKeyword({ candidates: [], coveredSlugs: new Set() })).toBeNull();
  });

  it("picks GSC striking-distance over low-volume Ahrefs idea when scores tie", () => {
    const candidates: Candidate[] = [
      { keyword: "low value", source: "ahrefs", volume: 50, kd: 5, position: null },
      { keyword: "mca lawsuit defense", source: "gsc", volume: 200, kd: 0, position: 11 },
    ];
    const picked = selectKeyword({ candidates, coveredSlugs: new Set() });
    expect(picked?.keyword).toBe("mca lawsuit defense");
  });
});
