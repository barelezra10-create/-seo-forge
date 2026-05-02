import { getDb } from "@/lib/db";
import { tables } from "@seo-forge/shared";
import { eq, sql } from "drizzle-orm";

export type SiteSummary = {
  id: string;
  name: string;
  domain: string;
  killSwitch: boolean;
  autoPublish: boolean;
  articleCount: number;
};

export async function getAllSites(): Promise<SiteSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: tables.sites.id,
      name: tables.sites.name,
      domain: tables.sites.domain,
      killSwitch: tables.sites.killSwitch,
      autoPublish: tables.sites.autoPublish,
      articleCount: sql<number>`(SELECT COUNT(*)::int FROM ${tables.contentIndex} WHERE ${tables.contentIndex.siteId} = ${sql.raw(`"sites"."id"`)})`,
    })
    .from(tables.sites)
    .orderBy(tables.sites.name);
  return rows;
}

export async function getSite(siteId: string) {
  const db = getDb();
  const [site] = await db.select().from(tables.sites).where(eq(tables.sites.id, siteId));
  return site ?? null;
}
