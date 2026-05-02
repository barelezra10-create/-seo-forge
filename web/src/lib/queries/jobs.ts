import { getDb } from "@/lib/db";
import { tables } from "@seo-forge/shared";
import { desc, eq } from "drizzle-orm";

export type JobRow = {
  id: number;
  type: string;
  siteId: string | null;
  status: "pending" | "claimed" | "running" | "succeeded" | "failed" | "skipped";
  mode: "subscription" | "api";
  payload: unknown;
  result: unknown;
  error: string | null;
  attempts: number;
  costUsd: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

export async function listRecentJobs(limit = 50): Promise<JobRow[]> {
  const db = getDb();
  return await db
    .select()
    .from(tables.jobs)
    .orderBy(desc(tables.jobs.createdAt))
    .limit(limit);
}

export async function getJob(id: number): Promise<JobRow | null> {
  const db = getDb();
  const [row] = await db.select().from(tables.jobs).where(eq(tables.jobs.id, id));
  return row ?? null;
}
