import { describe, it, expect } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("parses a complete env object", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://u:p@localhost:5432/db",
      VOYAGE_API_KEY: "k1",
      AHREFS_API_KEY: "k2",
      GSC_REFRESH_TOKEN: "k3",
      ANTHROPIC_API_KEY: "k4",
      GH_PAT_MCA_GUIDE: "k5",
      WORKSPACE_REPOS_DIR: "./workspace/repos",
    });
    expect(env.DATABASE_URL).toBe("postgres://u:p@localhost:5432/db");
    expect(env.VOYAGE_API_KEY).toBe("k1");
  });

  it("throws on missing required field", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("defaults WORKSPACE_REPOS_DIR if absent", () => {
    const env = parseEnv({
      DATABASE_URL: "postgres://u:p@localhost:5432/db",
      VOYAGE_API_KEY: "k1",
      AHREFS_API_KEY: "k2",
      GSC_REFRESH_TOKEN: "k3",
      ANTHROPIC_API_KEY: "k4",
      GH_PAT_MCA_GUIDE: "k5",
    });
    expect(env.WORKSPACE_REPOS_DIR).toBe("./workspace/repos");
  });

  it("rejects DATABASE_URL with non-postgres scheme", () => {
    expect(() =>
      parseEnv({
        DATABASE_URL: "redis://localhost:6379",
        VOYAGE_API_KEY: "k1",
        AHREFS_API_KEY: "k2",
        GSC_REFRESH_TOKEN: "k3",
        ANTHROPIC_API_KEY: "k4",
        GH_PAT_MCA_GUIDE: "k5",
      }),
    ).toThrow();
  });
});
