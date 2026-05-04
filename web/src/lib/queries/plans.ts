import { getDb } from "@/lib/db";
import { tables } from "@seo-forge/shared";
import { eq, sql } from "drizzle-orm";

export type PlanRow = {
  id: number;
  siteId: string;
  plannedDate: string;
  targetKeyword: string;
  intent: string;
  research: {
    source?: string;
    volume?: number;
    kd?: number;
    position?: number | null;
    audience?: string;
    outline?: string[];
  };
  sisterLinks: Array<{ siteId: string; url: string; title: string; distance: number }>;
  status: "planned" | "published" | "skipped" | "failed";
  publishedJobId: number | null;
};

export async function listUpcomingPlans(daysAhead = 14): Promise<PlanRow[]> {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - 1); // include yesterday's "did we publish?"
  const rows = await db
    .select()
    .from(tables.articlePlans)
    .where(sql`planned_date >= ${cutoff.toISOString().slice(0, 10)}`)
    .orderBy(tables.articlePlans.plannedDate, tables.articlePlans.siteId);
  // daysAhead reserved for future filtering; keep parameter for callers.
  void daysAhead;
  return rows as unknown as PlanRow[];
}

export async function getPlan(id: number): Promise<PlanRow | null> {
  const db = getDb();
  const [row] = await db.select().from(tables.articlePlans).where(eq(tables.articlePlans.id, id));
  return (row as unknown as PlanRow | undefined) ?? null;
}
