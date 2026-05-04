import { describe, it, expect } from "vitest";
import {
  sites,
  jobs,
  contentIndex,
  authStatus,
  gscSnapshot,
  ahrefsSnapshot,
  opportunities,
  articlePlans,
} from "./schema";

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
  it("gscSnapshot has expected columns", () => {
    expect(gscSnapshot.siteId.name).toBe("site_id");
    expect(gscSnapshot.snapshotDate.name).toBe("snapshot_date");
    expect(gscSnapshot.totalClicks.name).toBe("total_clicks");
    expect(gscSnapshot.totalImpressions.name).toBe("total_impressions");
    expect(gscSnapshot.payload.name).toBe("payload");
  });
  it("ahrefsSnapshot has expected columns", () => {
    expect(ahrefsSnapshot.siteId.name).toBe("site_id");
    expect(ahrefsSnapshot.domainRating.name).toBe("domain_rating");
    expect(ahrefsSnapshot.refDomains.name).toBe("ref_domains");
    expect(ahrefsSnapshot.payload.name).toBe("payload");
  });
  it("opportunities has expected columns", () => {
    expect(opportunities.siteId.name).toBe("site_id");
    expect(opportunities.type.name).toBe("type");
    expect(opportunities.status.name).toBe("status");
    expect(opportunities.payload.name).toBe("payload");
  });
  it("articlePlans has expected columns", () => {
    expect(articlePlans.siteId.name).toBe("site_id");
    expect(articlePlans.plannedDate.name).toBe("planned_date");
    expect(articlePlans.targetKeyword.name).toBe("target_keyword");
    expect(articlePlans.intent.name).toBe("intent");
    expect(articlePlans.research.name).toBe("research");
    expect(articlePlans.sisterLinks.name).toBe("sister_links");
    expect(articlePlans.status.name).toBe("status");
    expect(articlePlans.publishedJobId.name).toBe("published_job_id");
  });
});
