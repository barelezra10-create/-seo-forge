import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { tables } from "@seo-forge/shared";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const formData = await req.formData();
  const siteId = String(formData.get("siteId") ?? "").trim();

  if (!siteId) {
    return NextResponse.json({ error: "siteId required" }, { status: 400 });
  }

  const db = getDb();
  const [site] = await db.select().from(tables.sites).where(eq(tables.sites.id, siteId));
  if (!site) {
    return NextResponse.json({ error: `site not found: ${siteId}` }, { status: 404 });
  }
  if (site.killSwitch) {
    return NextResponse.json({ error: "site is paused (kill switch on)" }, { status: 409 });
  }

  const [inserted] = await db
    .insert(tables.jobs)
    .values({
      type: "publish",
      siteId: site.id,
      status: "pending",
      payload: { siteId: site.id, source: "manual-trigger" },
    })
    .returning({ id: tables.jobs.id });

  if (!inserted) {
    return NextResponse.json({ error: "insert failed" }, { status: 500 });
  }

  const url = new URL(req.url);
  url.pathname = `/jobs/${inserted.id}`;
  url.search = "";
  return NextResponse.redirect(url, { status: 303 });
}
