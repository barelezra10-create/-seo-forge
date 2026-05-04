import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { tables } from "@seo-forge/shared";

export async function POST(req: Request) {
  // Insert a planner job per day from tomorrow through the end of next month.
  // Worker picks them up at 30s cadence.
  const db = getDb();
  const jobs: Array<{
    type: string;
    siteId: null;
    status: "pending";
    payload: { date: string };
  }> = [];
  // End-of-next-month gives at least a full month of plans no matter when run.
  const endOfNextMonth = new Date();
  endOfNextMonth.setMonth(endOfNextMonth.getMonth() + 2, 0);
  endOfNextMonth.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysToPlan = Math.max(
    7,
    Math.ceil((endOfNextMonth.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
  );
  for (let i = 1; i <= daysToPlan; i++) {
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
