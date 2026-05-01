import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit from "simple-git";
import { GitPublisher } from "./git-publisher";

let tmp: string;
let bareRepo: string;
let workspace: string;

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "seo-forge-test-"));
  bareRepo = join(tmp, "bare.git");
  workspace = join(tmp, "workspace");
  await mkdir(bareRepo);
  await mkdir(workspace);
  const g = simpleGit(bareRepo);
  await g.init(true);

  // seed initial commit so main branch exists
  const seedDir = join(tmp, "seed");
  await mkdir(seedDir);
  const seedGit = simpleGit(seedDir);
  await seedGit.init();
  await seedGit.addConfig("user.email", "test@test");
  await seedGit.addConfig("user.name", "Test");
  await writeFile(join(seedDir, "README.md"), "seed");
  await seedGit.add(".");
  await seedGit.commit("seed");
  await seedGit.branch(["-M", "main"]);
  await seedGit.addRemote("origin", bareRepo);
  await seedGit.push("origin", "main");
});

afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("GitPublisher", () => {
  it("clones, writes a file, commits, pushes", async () => {
    const publisher = new GitPublisher({ workspaceDir: workspace });
    const result = await publisher.publish({
      siteId: "test-site",
      repoUrl: bareRepo,
      branch: "main",
      relativeFilePath: "content/articles/foo.mdx",
      fileContent: "# hello\n",
      commitMessage: "feat(seo-forge): publish foo",
      authorName: "SEO Forge",
      authorEmail: "seo-forge@local",
    });
    expect(result.commitSha).toMatch(/^[a-f0-9]{7,}/);

    // verify by cloning the bare repo fresh
    const verifyDir = join(tmp, "verify");
    await mkdir(verifyDir);
    const vg = simpleGit(verifyDir);
    await vg.clone(bareRepo, verifyDir);
    const text = await readFile(join(verifyDir, "content/articles/foo.mdx"), "utf-8");
    expect(text).toBe("# hello\n");
  });

  it("re-uses an existing local clone (pulls instead of re-cloning)", async () => {
    const publisher = new GitPublisher({ workspaceDir: workspace });
    const r1 = await publisher.publish({
      siteId: "test-site",
      repoUrl: bareRepo,
      branch: "main",
      relativeFilePath: "content/articles/bar.mdx",
      fileContent: "first\n",
      commitMessage: "feat: bar",
      authorName: "SEO Forge",
      authorEmail: "seo-forge@local",
    });
    const r2 = await publisher.publish({
      siteId: "test-site",
      repoUrl: bareRepo,
      branch: "main",
      relativeFilePath: "content/articles/baz.mdx",
      fileContent: "second\n",
      commitMessage: "feat: baz",
      authorName: "SEO Forge",
      authorEmail: "seo-forge@local",
    });
    expect(r1.commitSha).not.toBe(r2.commitSha);
  });
});
