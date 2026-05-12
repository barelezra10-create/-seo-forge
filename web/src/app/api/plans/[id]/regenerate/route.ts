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
  const [plan] = await db
    .select()
    .from(tables.articlePlans)
    .where(eq(tables.articlePlans.id, id));
  if (!plan) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (plan.status !== "planned") {
    return NextResponse.json({ error: `cannot regenerate ${plan.status} plans` }, { status: 409 });
  }

  // Enqueue a single-day planner job that excludes the current keyword.
  // The worker's processNextSingleDayPlannerJob will pick this up and
  // re-run planSiteForDate with excludeKeywords set; the plan row is
  // upserted (target = (site_id, planned_date)) with a fresh keyword +
  // sister links.
  await db.insert(tables.jobs).values({
    type: "planner-single",
    siteId: plan.siteId,
    status: "pending",
    payload: {
      date: plan.plannedDate,
      siteId: plan.siteId,
      excludeKeywords: [plan.targetKeyword],
      regenerateFromPlanId: id,
    },
  });

  return NextResponse.redirect(publicUrl(req, `/plans/${id}`), { status: 303 });
}
