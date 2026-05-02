import { notFound } from "next/navigation";
import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getJob } from "@/lib/queries/jobs";
import { JobStatusRefresher } from "./JobStatusRefresher";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-zinc-100 text-zinc-700",
  claimed: "bg-blue-100 text-blue-700",
  running: "bg-yellow-100 text-yellow-700",
  succeeded: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-zinc-100 text-zinc-500",
};

export default async function JobDetailPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const id = Number(jobId);
  if (!Number.isFinite(id)) notFound();
  const job = await getJob(id);
  if (!job) notFound();

  return (
    <>
      <TopBar
        title={`Job #${job.id}`}
        actions={
          <Link href="/jobs" className="text-sm text-zinc-500 hover:underline">
            ← back to jobs
          </Link>
        }
      />
      <main className="p-6 space-y-6 max-w-4xl">
        <JobStatusRefresher status={job.status} />
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[job.status] ?? ""}`}>
                {job.status}
              </span>
              <span className="text-sm text-zinc-500">
                {job.type}{job.siteId ? ` · ${job.siteId}` : ""}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-zinc-500">Created</dt>
              <dd>{new Date(job.createdAt).toLocaleString()}</dd>
              <dt className="text-zinc-500">Started</dt>
              <dd>{job.startedAt ? new Date(job.startedAt).toLocaleString() : "-"}</dd>
              <dt className="text-zinc-500">Finished</dt>
              <dd>{job.finishedAt ? new Date(job.finishedAt).toLocaleString() : "-"}</dd>
              <dt className="text-zinc-500">Mode</dt>
              <dd>{job.mode}</dd>
              <dt className="text-zinc-500">Attempts</dt>
              <dd>{job.attempts}</dd>
              <dt className="text-zinc-500">Cost</dt>
              <dd>{job.costUsd > 0 ? `${(job.costUsd / 100).toFixed(2)} USD` : "-"}</dd>
            </dl>
          </CardContent>
        </Card>

        {job.error && (
          <Card>
            <CardHeader>
              <CardTitle className="text-red-700">Error</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-red-50 p-3 rounded text-xs whitespace-pre-wrap text-red-900 overflow-x-auto">
                {job.error}
              </pre>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Payload</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-zinc-50 p-3 rounded text-xs whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(job.payload, null, 2)}
            </pre>
          </CardContent>
        </Card>

        {job.result !== null && job.result !== undefined && (
          <Card>
            <CardHeader>
              <CardTitle>Result</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-zinc-50 p-3 rounded text-xs whitespace-pre-wrap overflow-x-auto">
                {JSON.stringify(job.result, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}
