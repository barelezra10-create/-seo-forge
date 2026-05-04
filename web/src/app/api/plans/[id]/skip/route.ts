import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { tables } from "@seo-forge/shared";
import { eq } from "drizzle-orm";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  const db = getDb();
  await db
    .update(tables.articlePlans)
    .set({ status: "skipped", updatedAt: new Date() })
    .where(eq(tables.articlePlans.id, id));
  const url = new URL(req.url);
  url.pathname = "/calendar";
  url.search = "";
  return NextResponse.redirect(url, { status: 303 });
}
