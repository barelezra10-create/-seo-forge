import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { publicUrl } from "@/lib/redirect";
import { tables } from "@seo-forge/shared";

export async function POST(req: Request) {
  const formData = await req.formData();
  const date = String(formData.get("date") ?? "").trim();
  const siteId = String(formData.get("siteId") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !siteId) {
    return NextResponse.json(
      { error: "date (YYYY-MM-DD) and siteId required" },
      { status: 400 },
    );
  }
  const db = getDb();
  await db.insert(tables.jobs).values({
    type: "planner-single",
    siteId,
    status: "pending",
    payload: { date, siteId },
  });
  return NextResponse.redirect(
    publicUrl(
      req,
      "/calendar",
      `?site=${encodeURIComponent(siteId)}&year=${date.slice(0, 4)}&month=${date.slice(5, 7)}`,
    ),
    { status: 303 },
  );
}
