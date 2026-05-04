import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { tables } from "@seo-forge/shared";
import { eq } from "drizzle-orm";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const db = getDb();
  const [plan] = await db
    .select()
    .from(tables.articlePlans)
    .where(eq(tables.articlePlans.id, id));
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (plan.status !== "planned") {
    return NextResponse.json({ error: `already ${plan.status}` }, { status: 409 });
  }

  const [job] = await db
    .insert(tables.jobs)
    .values({
      type: "publish",
      siteId: plan.siteId,
      status: "pending",
      payload: { siteId: plan.siteId, planId: plan.id, source: "manual-from-calendar" },
    })
    .returning({ id: tables.jobs.id });

  if (!job) return NextResponse.json({ error: "job insert failed" }, { status: 500 });

  const url = new URL(req.url);
  url.pathname = `/jobs/${job.id}`;
  url.search = "";
  return NextResponse.redirect(url, { status: 303 });
}
