import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { tables } from "@seo-forge/shared";

export async function POST(req: Request) {
  const db = getDb();
  const sites = await db.select({ id: tables.sites.id }).from(tables.sites);

  const jobs = sites.flatMap((s) => [
    { type: "gsc_snapshot", siteId: s.id, status: "pending" as const, payload: { siteId: s.id } },
    { type: "ahrefs_snapshot", siteId: s.id, status: "pending" as const, payload: { siteId: s.id } },
  ]);

  if (jobs.length > 0) {
    await db.insert(tables.jobs).values(jobs);
  }

  const url = new URL(req.url);
  url.pathname = "/jobs";
  url.search = "";
  return NextResponse.redirect(url, { status: 303 });
}
