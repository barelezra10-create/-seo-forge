import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { publicUrl } from "@/lib/redirect";
import { tables } from "@seo-forge/shared";
import { eq } from "drizzle-orm";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const db = getDb();
  const [opp] = await db.select().from(tables.opportunities).where(eq(tables.opportunities.id, id));
  if (!opp) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (opp.status !== "open") {
    return NextResponse.json({ error: `already ${opp.status}` }, { status: 409 });
  }

  // Enqueue a publish job tied to this opportunity
  const payload = opp.payload as { keyword?: string };
  const [job] = await db
    .insert(tables.jobs)
    .values({
      type: "publish",
      siteId: opp.siteId,
      status: "pending",
      payload: {
        siteId: opp.siteId,
        source: "opportunity",
        opportunityId: id,
        opportunityType: opp.type,
        targetKeyword: payload.keyword ?? null,
      },
    })
    .returning({ id: tables.jobs.id });

  if (!job) {
    return NextResponse.json({ error: "job insert failed" }, { status: 500 });
  }

  await db
    .update(tables.opportunities)
    .set({
      status: "acted_on",
      actedAt: new Date(),
      actedJobId: job.id,
    })
    .where(eq(tables.opportunities.id, id));

  return NextResponse.redirect(publicUrl(req, `/jobs/${job.id}`), { status: 303 });
}
