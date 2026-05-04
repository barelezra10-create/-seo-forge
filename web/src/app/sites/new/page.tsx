import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function NewSitePage() {
  return (
    <>
      <TopBar title="Add site" />
      <main className="p-6 max-w-2xl">
        <Card>
          <CardContent className="pt-6">
            <form action="/api/sites" method="POST" className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Site ID</label>
                <input
                  name="id"
                  required
                  pattern="[a-z0-9-]+"
                  placeholder="e.g. my-new-site"
                  className="w-full border border-zinc-200 rounded-md px-3 py-2 text-sm bg-white"
                />
                <p className="text-xs text-zinc-500 mt-1">
                  Lowercase letters, digits, and hyphens only. Used internally.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Display name</label>
                <input
                  name="name"
                  required
                  placeholder="e.g. My New Site"
                  className="w-full border border-zinc-200 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Domain</label>
                <input
                  name="domain"
                  required
                  placeholder="e.g. mynewsite.com (no https://)"
                  className="w-full border border-zinc-200 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Repo URL</label>
                <input
                  name="repoUrl"
                  required
                  placeholder="git@github.com:owner/repo.git"
                  className="w-full border border-zinc-200 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Content directory</label>
                <input
                  name="contentDir"
                  required
                  placeholder="e.g. content/articles"
                  defaultValue="content/articles"
                  className="w-full border border-zinc-200 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Brand voice</label>
                <textarea
                  name="brandVoice"
                  required
                  rows={3}
                  placeholder="One-sentence description of how articles on this site should sound."
                  className="w-full border border-zinc-200 rounded-md px-3 py-2 text-sm bg-white"
                />
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-xs text-yellow-900">
                After saving, we still need to build a publishing adapter for this site (the code
                that knows how to write articles in the site&apos;s format). Articles can be planned
                in the calendar but not published until the adapter exists.
              </div>
              <Button type="submit">Add site</Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
