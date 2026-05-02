import { sql } from "drizzle-orm";
import { getDb } from "../orchestrator/_db-singleton.js";
import type { OpportunityDraft } from "./types.js";

export type DetectTrafficDeclineInput = {
  siteId: string;
  /** How many days back to compare against (default 28) */
  days?: number;
  /** Decline threshold as a decimal (default 0.30 = 30% drop) */
  thresholdPct?: number;
};

export async function detectTrafficDecline(i: DetectTrafficDeclineInput): Promise<OpportunityDraft[]> {
  const db = getDb();
  const days = i.days ?? 28;
  const threshold = i.thresholdPct ?? 0.30;

  const result = await db.execute<{ snapshot_date: string; total_clicks: number }>(sql`
    SELECT snapshot_date, total_clicks
    FROM gsc_snapshot
    WHERE site_id = ${i.siteId}
    ORDER BY snapshot_date DESC
    LIMIT 60
  `);
  const snapshots = result as unknown as Array<{ snapshot_date: string; total_clicks: number }>;
  if (snapshots.length < 2) return [];

  const latest = snapshots[0]!;
  const cutoff = new Date(latest.snapshot_date);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const olderSnap = snapshots.find((s) => String(s.snapshot_date) <= cutoffStr) ?? snapshots[snapshots.length - 1]!;

  if (olderSnap.total_clicks === 0) return [];
  const dropPct = (olderSnap.total_clicks - latest.total_clicks) / olderSnap.total_clicks;
  if (dropPct < threshold) return [];

  return [
    {
      siteId: i.siteId,
      type: "traffic_decline" as const,
      title: `Site traffic dropped ${(dropPct * 100).toFixed(0)}% vs ${days} days ago`,
      description: `GSC clicks fell from ${olderSnap.total_clicks} to ${latest.total_clicks} between ${olderSnap.snapshot_date} and ${latest.snapshot_date}. Investigate top declining pages and refresh content.`,
      payload: {
        scope: "site",
        oldClicks: olderSnap.total_clicks,
        newClicks: latest.total_clicks,
        dropPct,
        oldDate: String(olderSnap.snapshot_date),
        newDate: String(latest.snapshot_date),
      },
      dedupKey: `traffic_decline:${i.siteId}:site`,
    },
  ];
}
