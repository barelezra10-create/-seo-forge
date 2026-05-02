import { type GscQuery } from "@/lib/queries/analytics";
import { formatNumber, formatPercent } from "@/lib/utils";

export function GscQueriesTable({ queries, title = "Top GSC queries (28d)" }: { queries: GscQuery[]; title?: string }) {
  if (queries.length === 0) {
    return (
      <div className="text-sm text-zinc-500 italic">
        No GSC data yet. Refresh after the next snapshot run.
      </div>
    );
  }
  return (
    <div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="text-left py-2">Query</th>
            <th className="text-right py-2">Clicks</th>
            <th className="text-right py-2">Impr.</th>
            <th className="text-right py-2">CTR</th>
            <th className="text-right py-2">Pos.</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200">
          {queries.slice(0, 20).map((q) => (
            <tr key={q.query} className="text-sm">
              <td className="py-1.5 truncate max-w-[280px]">{q.query}</td>
              <td className="py-1.5 text-right">{formatNumber(q.clicks)}</td>
              <td className="py-1.5 text-right">{formatNumber(q.impressions)}</td>
              <td className="py-1.5 text-right text-zinc-500">{formatPercent(q.ctr, 1)}</td>
              <td className="py-1.5 text-right text-zinc-500">{q.position.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
