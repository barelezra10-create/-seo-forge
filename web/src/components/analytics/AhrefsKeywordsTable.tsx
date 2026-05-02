import { type AhrefsKeyword } from "@/lib/queries/analytics";
import { formatNumber } from "@/lib/utils";

export function AhrefsKeywordsTable({ keywords }: { keywords: AhrefsKeyword[] }) {
  if (keywords.length === 0) {
    return <div className="text-sm text-zinc-500 italic">No Ahrefs keyword data yet.</div>;
  }
  return (
    <div>
      <h3 className="font-semibold mb-2">Top Ahrefs keywords</h3>
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wide text-zinc-500">
          <tr>
            <th className="text-left py-2">Keyword</th>
            <th className="text-right py-2">Vol.</th>
            <th className="text-right py-2">KD</th>
            <th className="text-right py-2">Pos.</th>
            <th className="text-right py-2">Traffic</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200">
          {keywords.slice(0, 20).map((k) => (
            <tr key={k.keyword} className="text-sm">
              <td className="py-1.5 truncate max-w-[280px]">{k.keyword}</td>
              <td className="py-1.5 text-right">{formatNumber(k.volume)}</td>
              <td className="py-1.5 text-right text-zinc-500">{k.difficulty ?? "-"}</td>
              <td className="py-1.5 text-right text-zinc-500">{k.position}</td>
              <td className="py-1.5 text-right">{formatNumber(k.traffic)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
