import { describe, it, expect } from "vitest";
import { sites, jobs, contentIndex, authStatus } from "./schema";

describe("db schema", () => {
  it("sites has expected columns", () => {
    expect(sites.id.name).toBe("id");
    expect(sites.repoUrl.name).toBe("repo_url");
    expect(sites.killSwitch.name).toBe("kill_switch");
  });
  it("jobs has expected columns", () => {
    expect(jobs.id.name).toBe("id");
    expect(jobs.type.name).toBe("type");
    expect(jobs.status.name).toBe("status");
    expect(jobs.mode.name).toBe("mode");
  });
  it("contentIndex has vector column", () => {
    expect(contentIndex.topicEmbedding.name).toBe("topic_embedding");
  });
  it("authStatus has lastChecked column", () => {
    expect(authStatus.lastChecked.name).toBe("last_checked");
  });
});
