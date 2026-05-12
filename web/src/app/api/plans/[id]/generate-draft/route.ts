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
  if (!plan) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (plan.status !== "planned") {
    return NextResponse.json({ error: `cannot draft ${plan.status} plans` }, { status: 409 });
  }

  await db.insert(tables.jobs).values({
    type: "draft",
    siteId: plan.siteId,
    status: "pending",
    payload: { planId: plan.id, siteId: plan.siteId, source: "manual-generate-draft" },
  });

  return NextResponse.redirect(publicUrl(req, `/plans/${id}`), { status: 303 });
}
