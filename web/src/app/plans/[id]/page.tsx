import Link from "next/link";
import { notFound } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getPlan } from "@/lib/queries/plans";
import { getAllSites } from "@/lib/queries/sites";
import { formatNumber } from "@/lib/utils";

const STATUS_BADGES: Record<string, string> = {
  planned: "bg-blue-100 text-blue-700",
  published: "bg-green-100 text-green-700",
  skipped: "bg-zinc-100 text-zinc-500",
  failed: "bg-red-100 text-red-700",
};

const INTENT_LABELS: Record<string, string> = {
  informational: "Informational guide",
  commercial: "Commercial / listicle",
  transactional: "Transactional / service",
  navigational: "Navigational / brand",
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(s: string): string {
  // Convert [text](url) markdown links to anchor tags. Escape everything else.
  // Strategy: split into link / non-link segments, escape each segment, then
  // reassemble with anchor tags.
  const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(s)) !== null) {
    out += escapeHtml(s.slice(last, m.index));
    const text = escapeHtml(m[1]!);
    const url = escapeHtml(m[2]!);
    out += `<a href="${url}" class="text-blue-600 hover:underline" target="_blank" rel="noopener">${text}</a>`;
    last = m.index + m[0].length;
  }
  out += escapeHtml(s.slice(last));
  return out;
}

function markdownToHtml(body: string): string {
  // Minimal markdown renderer: split paragraphs by blank lines, h2 lines
  // (## ...) become <h2>, everything else becomes a <p>. Inline links handled
  // by renderInline.
  const blocks = body.replace(/\r\n/g, "\n").trim().split(/\n{2,}/);
  return blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("## ")) {
        return `<h2>${renderInline(trimmed.slice(3).trim())}</h2>`;
      }
      // Collapse single newlines inside a paragraph into spaces.
      const single = trimmed.replace(/\n+/g, " ");
      return `<p>${renderInline(single)}</p>`;
    })
    .join("\n");
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export default async function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();
  const plan = await getPlan(id);
  if (!plan) notFound();

  const sites = await getAllSites();
  const site = sites.find((s) => s.id === plan.siteId);
  const siteName = site?.name ?? plan.siteId;
  const research = plan.research ?? {};

  const dateLabel = new Date(plan.plannedDate + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <TopBar
        title={plan.targetKeyword}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/calendar?site=${encodeURIComponent(plan.siteId)}&year=${plan.plannedDate.slice(0, 4)}&month=${Number(plan.plannedDate.slice(5, 7))}`}
              className="text-sm text-zinc-500 hover:underline"
            >
              ← back to calendar
            </Link>
            {plan.status === "planned" && (
              <>
                <form action={`/api/plans/${plan.id}/regenerate`} method="POST">
                  <Button type="submit" variant="outline" size="sm">Regenerate</Button>
                </form>
                <form action={`/api/plans/${plan.id}/skip`} method="POST">
                  <Button type="submit" variant="outline" size="sm">Skip</Button>
                </form>
                <form action={`/api/plans/${plan.id}/publish-now`} method="POST">
                  <Button type="submit" size="sm">{plan.draft ? "Publish draft" : "Publish now"}</Button>
                </form>
              </>
            )}
            {plan.status === "published" && plan.publishedJobId && (
              <Link href={`/jobs/${plan.publishedJobId}`} className="text-sm text-blue-600 hover:underline">
                view job →
              </Link>
            )}
          </div>
        }
      />
      <main className="p-6 space-y-6 max-w-4xl">
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded ${STATUS_BADGES[plan.status] ?? "bg-zinc-100"}`}>
                {plan.status}
              </span>
              <span className="text-xs text-zinc-500">{siteName}</span>
              <span className="text-xs text-zinc-400">·</span>
              <span className="text-xs text-zinc-500">{dateLabel}</span>
            </div>
            <h2 className="text-xl font-semibold">{plan.targetKeyword}</h2>
            <p className="text-sm text-zinc-600">
              {INTENT_LABELS[plan.intent] ?? plan.intent}
              {research.audience ? ` · ${research.audience}` : ""}
            </p>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-zinc-500 mb-1">Source</p>
              <p className="font-medium uppercase text-sm">{research.source ?? "ahrefs"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-zinc-500 mb-1">Search volume</p>
              <p className="text-xl font-bold">{formatNumber(research.volume ?? 0)}</p>
              <p className="text-xs text-zinc-400">monthly</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs text-zinc-500 mb-1">Keyword difficulty</p>
              <p className="text-xl font-bold">{research.kd ?? "–"}</p>
              {research.position != null && (
                <p className="text-xs text-zinc-400">currently #{Number(research.position).toFixed(1)}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Outline (the agent will follow this as a guide, not a script)</CardTitle>
          </CardHeader>
          <CardContent>
            {research.outline && research.outline.length > 0 ? (
              <ol className="list-decimal pl-5 space-y-1.5 text-sm text-zinc-700">
                {research.outline.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-zinc-500 italic">No outline saved.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sister-site links the agent will inline</CardTitle>
          </CardHeader>
          <CardContent>
            {plan.sisterLinks.length === 0 ? (
              <p className="text-sm text-zinc-500 italic">
                No sister-site articles found within similarity threshold. The agent will write without cross-links.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-200">
                {plan.sisterLinks.map((l, i) => {
                  const sisterSite = sites.find((s) => s.id === l.siteId);
                  return (
                    <li key={i} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm">{l.title}</p>
                          <a
                            href={l.url}
                            target="_blank"
                            rel="noopener"
                            className="text-xs text-blue-600 hover:underline break-all"
                          >
                            {l.url}
                          </a>
                          <p className="text-xs text-zinc-500 mt-1">
                            from {sisterSite?.name ?? l.siteId} · cosine distance {l.distance.toFixed(3)}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Article preview</CardTitle>
          </CardHeader>
          <CardContent>
            {(() => {
              const draft = plan.draft as {
                ledeAnswer: string;
                quickFacts: string[];
                body: string;
                durationMs?: number;
              } | null;
              if (!draft) {
                if (plan.status !== "planned") {
                  return (
                    <p className="text-sm text-zinc-500 italic">
                      No draft was generated before this plan was {plan.status}.
                    </p>
                  );
                }
                return (
                  <div className="space-y-3">
                    <p className="text-sm text-zinc-600">
                      No draft yet. Generate one with Claude so you can preview the body before publishing.
                      The article will be cached on this plan and the publish step will reuse it.
                    </p>
                    <form action={`/api/plans/${plan.id}/generate-draft`} method="POST">
                      <Button type="submit" size="sm">Generate draft</Button>
                    </form>
                  </div>
                );
              }
              const generatedAt = plan.draftGeneratedAt
                ? new Date(plan.draftGeneratedAt as string | Date).toLocaleString()
                : "unknown";
              const wordCount = countWords(draft.body);
              const durationLabel =
                typeof draft.durationMs === "number"
                  ? `${(draft.durationMs / 1000).toFixed(1)}s claude run`
                  : null;
              const bodyHtml = markdownToHtml(draft.body);
              return (
                <div className="space-y-5">
                  <p className="text-lg leading-relaxed text-zinc-800 border-l-4 border-blue-500 pl-4 italic">
                    {draft.ledeAnswer}
                  </p>
                  {draft.quickFacts.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-700 mb-2">
                        Quick Facts
                      </h3>
                      <ul className="list-disc pl-5 space-y-1 text-sm text-zinc-700">
                        {draft.quickFacts.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: bodyHtml }}
                  />
                  <p className="text-xs text-zinc-500">
                    Generated {generatedAt} · {wordCount.toLocaleString()} words
                    {durationLabel ? ` · ${durationLabel}` : ""}
                  </p>
                  {plan.status === "planned" && (
                    <div className="flex items-center gap-2 pt-2 border-t border-zinc-200">
                      <form action={`/api/plans/${plan.id}/generate-draft`} method="POST">
                        <Button type="submit" variant="outline" size="sm">
                          Regenerate draft
                        </Button>
                      </form>
                      <form action={`/api/plans/${plan.id}/publish-now`} method="POST">
                        <Button type="submit" size="sm">
                          Publish this draft
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {plan.status === "published" && plan.publishedJobId && (
          <Card>
            <CardContent className="pt-6 text-sm">
              <p className="text-zinc-500">
                This plan was published. <Link href={`/jobs/${plan.publishedJobId}`} className="text-blue-600 hover:underline">View job log →</Link>
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}
