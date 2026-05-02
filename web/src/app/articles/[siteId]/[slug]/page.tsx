import { notFound } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getArticleBySlug } from "@/lib/queries/articles";

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ siteId: string; slug: string }>;
}) {
  const { siteId, slug } = await params;
  const article = await getArticleBySlug(siteId, slug);
  if (!article) notFound();
  const t = article.claudeTranscript;

  return (
    <>
      <TopBar title={article.title} />
      <main className="p-6 space-y-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Live URL</CardTitle>
          </CardHeader>
          <CardContent>
            <a
              href={article.url}
              target="_blank"
              className="text-blue-600 hover:underline break-all"
            >
              {article.url}
            </a>
            {article.firstParagraph && (
              <p className="mt-3 text-zinc-600">{article.firstParagraph}</p>
            )}
          </CardContent>
        </Card>

        {t ? (
          <Card>
            <CardHeader>
              <CardTitle>Claude session</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {typeof t.durationMs === "number" && (
                <p className="text-sm text-zinc-500">
                  Duration: {Math.round(t.durationMs / 1000)}s
                </p>
              )}
              {t.keyword && (
                <p className="text-sm">
                  <span className="text-zinc-500">Target keyword: </span>
                  <span className="font-medium">{t.keyword}</span>
                </p>
              )}
              {t.prompt && (
                <details>
                  <summary className="cursor-pointer font-medium text-sm">Prompt</summary>
                  <pre className="mt-2 bg-zinc-50 p-3 rounded text-xs whitespace-pre-wrap">
                    {t.prompt}
                  </pre>
                </details>
              )}
              {t.rawResponse && (
                <details>
                  <summary className="cursor-pointer font-medium text-sm">Raw response</summary>
                  <pre className="mt-2 bg-zinc-50 p-3 rounded text-xs whitespace-pre-wrap overflow-x-auto">
                    {t.rawResponse}
                  </pre>
                </details>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="pt-6 text-sm text-zinc-500">
              Claude transcript not available for this article. Transcripts are recorded for articles
              published after Phase 1B Task 9.
            </CardContent>
          </Card>
        )}
      </main>
    </>
  );
}
