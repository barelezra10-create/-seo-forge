import { type AhrefsBacklink } from "@/lib/queries/analytics";

export function BacklinksList({ backlinks }: { backlinks: AhrefsBacklink[] }) {
  if (backlinks.length === 0) {
    return <div className="text-sm text-zinc-500 italic">No backlinks indexed yet.</div>;
  }
  return (
    <div>
      <h3 className="font-semibold mb-2">Recent backlinks</h3>
      <ul className="divide-y divide-zinc-200">
        {backlinks.slice(0, 15).map((b, i) => (
          <li key={i} className="py-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <a href={b.urlFrom} target="_blank" className="text-blue-600 hover:underline truncate flex-1">
                {b.urlFrom}
              </a>
              <span className="text-xs text-zinc-500 shrink-0">DR {b.domainRatingSource.toFixed(0)}</span>
            </div>
            {b.anchor && <p className="text-xs text-zinc-500 truncate">&quot;{b.anchor}&quot;</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
