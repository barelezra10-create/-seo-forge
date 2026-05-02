import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { listRecentJobs } from "@/lib/queries/jobs";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-zinc-100 text-zinc-700",
  claimed: "bg-blue-100 text-blue-700",
  running: "bg-yellow-100 text-yellow-700",
  succeeded: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-zinc-100 text-zinc-500",
};

function fmtDuration(start: Date | null, end: Date | null): string {
  if (!start) return "-";
  const e = end ?? new Date();
  const ms = e.getTime() - start.getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

export default async function JobsPage() {
  const jobs = await listRecentJobs(100);
  return (
    <>
      <TopBar title="Jobs" />
      <main className="p-6">
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="text-left px-4 py-3">ID</th>
                  <th className="text-left px-4 py-3">Type</th>
                  <th className="text-left px-4 py-3">Site</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Created</th>
                  <th className="text-left px-4 py-3">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {jobs.map((j) => (
                  <tr key={j.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-2 font-mono text-xs">
                      <Link href={`/jobs/${j.id}`} className="text-blue-600 hover:underline">
                        #{j.id}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{j.type}</td>
                    <td className="px-4 py-2 text-zinc-500">{j.siteId ?? "-"}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${STATUS_STYLES[j.status] ?? ""}`}>
                        {j.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-zinc-500 text-xs">
                      {new Date(j.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-zinc-500 text-xs">
                      {fmtDuration(j.startedAt, j.finishedAt)}
                    </td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-zinc-500">
                      No jobs yet. Click &quot;Publish now&quot; on a site to enqueue one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
