import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { tables } from "@seo-forge/shared";
import { eq } from "drizzle-orm";

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const formData = await req.formData();
  const method = String(formData.get("_method") ?? "PATCH").toUpperCase();
  if (method !== "PATCH") {
    return NextResponse.json({ error: "only PATCH supported" }, { status: 405 });
  }

  const db = getDb();
  const [site] = await db.select().from(tables.sites).where(eq(tables.sites.id, siteId));
  if (!site) {
    return NextResponse.json({ error: `site not found: ${siteId}` }, { status: 404 });
  }

  const updates: Record<string, boolean> = {};
  const ks = formData.get("killSwitch");
  if (ks !== null) {
    updates.killSwitch = String(ks).toLowerCase() === "true";
  }
  const ap = formData.get("autoPublish");
  if (ap !== null) {
    updates.autoPublish = String(ap).toLowerCase() === "true";
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  }

  await db.update(tables.sites).set(updates).where(eq(tables.sites.id, siteId));

  const url = new URL(req.url);
  url.pathname = `/sites/${siteId}`;
  url.search = "";
  return NextResponse.redirect(url, { status: 303 });
}
