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
    const result = await publisher.publishFiles({
      siteId: "test-site",
      repoUrl: bareRepo,
      branch: "main",
      files: [
        { relativePath: "content/articles/foo.mdx", content: "# hello\n" },
      ],
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
    const r1 = await publisher.publishFiles({
      siteId: "test-site",
      repoUrl: bareRepo,
      branch: "main",
      files: [{ relativePath: "content/articles/bar.mdx", content: "first\n" }],
      commitMessage: "feat: bar",
      authorName: "SEO Forge",
      authorEmail: "seo-forge@local",
    });
    const r2 = await publisher.publishFiles({
      siteId: "test-site",
      repoUrl: bareRepo,
      branch: "main",
      files: [{ relativePath: "content/articles/baz.mdx", content: "second\n" }],
      commitMessage: "feat: baz",
      authorName: "SEO Forge",
      authorEmail: "seo-forge@local",
    });
    expect(r1.commitSha).not.toBe(r2.commitSha);
  });

  it("publishes multiple files in a single commit", async () => {
    const publisher = new GitPublisher({ workspaceDir: workspace });
    const result = await publisher.publishFiles({
      siteId: "test-site",
      repoUrl: bareRepo,
      branch: "main",
      files: [
        { relativePath: "content/articles/multi-a.mdx", content: "a\n" },
        { relativePath: "content/articles/multi-b.mdx", content: "b\n" },
      ],
      commitMessage: "feat: multi",
      authorName: "SEO Forge",
      authorEmail: "seo-forge@local",
    });
    expect(result.commitSha).toMatch(/^[a-f0-9]{7,}/);

    const verifyDir = join(tmp, "verify-multi");
    await mkdir(verifyDir);
    const vg = simpleGit(verifyDir);
    await vg.clone(bareRepo, verifyDir);
    expect(await readFile(join(verifyDir, "content/articles/multi-a.mdx"), "utf-8")).toBe("a\n");
    expect(await readFile(join(verifyDir, "content/articles/multi-b.mdx"), "utf-8")).toBe("b\n");
  });

  it("prepareClone returns local clone path and lets callers read files first", async () => {
    const publisher = new GitPublisher({ workspaceDir: workspace });
    const path = await publisher.prepareClone({
      siteId: "test-site",
      repoUrl: bareRepo,
      branch: "main",
    });
    expect(path).toBe(publisher.getClonePath("test-site"));
    // README.md was seeded at init; the prepared clone should expose it.
    const seeded = await readFile(join(path, "README.md"), "utf-8");
    expect(seeded).toBe("seed");
  });
});
