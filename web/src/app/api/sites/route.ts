import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { tables } from "@seo-forge/shared";

export async function POST(req: Request) {
  const formData = await req.formData();
  const id = String(formData.get("id") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim().toLowerCase();
  const repoUrl = String(formData.get("repoUrl") ?? "").trim();
  const contentDir = String(formData.get("contentDir") ?? "content/articles").trim();
  const brandVoice = String(formData.get("brandVoice") ?? "").trim();

  if (!id || !name || !domain || !repoUrl || !brandVoice) {
    return NextResponse.json({ error: "missing required fields" }, { status: 400 });
  }
  if (!/^[a-z0-9-]+$/.test(id)) {
    return NextResponse.json(
      { error: "id must be lowercase letters, digits, hyphens" },
      { status: 400 },
    );
  }

  const db = getDb();
  await db
    .insert(tables.sites)
    .values({
      id,
      name,
      domain,
      repoUrl,
      contentDir,
      brandVoice,
      branch: "main",
      fileFormat: "mdx",
      killSwitch: true, // start paused; adapter does not exist yet
    })
    .onConflictDoUpdate({
      target: tables.sites.id,
      set: { name, domain, repoUrl, contentDir, brandVoice },
    });

  const url = new URL(req.url);
  url.pathname = `/sites/${id}`;
  url.search = "";
  return NextResponse.redirect(url, { status: 303 });
}
