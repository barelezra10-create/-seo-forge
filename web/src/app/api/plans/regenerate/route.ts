import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { tables } from "@seo-forge/shared";

export async function POST(req: Request) {
  // Insert a "planner" job per day for the next 7 days. Worker picks them up.
  const db = getDb();
  const jobs: Array<{
    type: string;
    siteId: null;
    status: "pending";
    payload: { date: string };
  }> = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    jobs.push({
      type: "planner",
      siteId: null,
      status: "pending" as const,
      payload: { date: d.toISOString().slice(0, 10) },
    });
  }
  await db.insert(tables.jobs).values(jobs);
  const url = new URL(req.url);
  url.pathname = "/calendar";
  url.search = "";
  return NextResponse.redirect(url, { status: 303 });
}
