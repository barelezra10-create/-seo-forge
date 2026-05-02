import { getDb } from "@/lib/db";
import { tables } from "@seo-forge/shared";
import { desc, eq, and } from "drizzle-orm";

export type OpportunityRow = {
  id: number;
  siteId: string;
  type: string;
  title: string;
  description: string;
  status: "open" | "acted_on" | "dismissed" | "expired";
  payload: Record<string, unknown>;
  detectedAt: Date;
};

export async function listOpenOpportunities(siteId?: string): Promise<OpportunityRow[]> {
  const db = getDb();
  const conds = [eq(tables.opportunities.status, "open")];
  if (siteId) conds.push(eq(tables.opportunities.siteId, siteId));
  const where = conds.length === 1 ? conds[0] : and(...conds);

  const rows = await db
    .select({
      id: tables.opportunities.id,
      siteId: tables.opportunities.siteId,
      type: tables.opportunities.type,
      title: tables.opportunities.title,
      description: tables.opportunities.description,
      status: tables.opportunities.status,
      payload: tables.opportunities.payload,
      detectedAt: tables.opportunities.detectedAt,
    })
    .from(tables.opportunities)
    .where(where)
    .orderBy(desc(tables.opportunities.detectedAt))
    .limit(200);

  return rows as OpportunityRow[];
}

export async function getOpportunity(id: number): Promise<OpportunityRow | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(tables.opportunities)
    .where(eq(tables.opportunities.id, id));
  return (row as OpportunityRow | undefined) ?? null;
}
