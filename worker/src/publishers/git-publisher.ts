import { mkdir, stat, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";

export type PrepareCloneInput = {
  siteId: string;
  repoUrl: string;
  branch: string;
};

export type PublishInput = {
  siteId: string;
  repoUrl: string;
  branch: string;
  files: Array<{ relativePath: string; content: string }>;
  commitMessage: string;
  authorName: string;
  authorEmail: string;
};

export type PublishResult = {
  commitSha: string;
  branch: string;
};

export class GitPublisher {
  constructor(private opts: { workspaceDir: string }) {}

  /** Absolute filesystem path to the local clone for a given site. */
  public getClonePath(siteId: string): string {
    return join(this.opts.workspaceDir, siteId);
  }

  private async ensureClone(input: PrepareCloneInput): Promise<{ git: SimpleGit; path: string }> {
    const path = this.getClonePath(input.siteId);
    let exists = false;
    try {
      const s = await stat(path);
      exists = s.isDirectory();
    } catch {
      exists = false;
    }
    if (!exists) {
      await mkdir(dirname(path), { recursive: true });
      const root = simpleGit();
      await root.clone(input.repoUrl, path);
    }
    const git = simpleGit(path);
    await git.fetch("origin", input.branch);
    await git.checkout(input.branch);
    await git.reset(["--hard", `origin/${input.branch}`]);
    await git.pull("origin", input.branch);
    return { git, path };
  }

  /**
   * Clone (or fast-forward) the repo and return the local clone path.
   * Used by the pipeline to give adapters a path to read existing files from
   * BEFORE they generate their output.
   */
  async prepareClone(input: PrepareCloneInput): Promise<string> {
    const { path } = await this.ensureClone(input);
    return path;
  }

  /**
   * Write one or more files to the local clone, commit, and push.
   * Assumes the clone already exists (typically from a prior prepareClone call,
   * but ensureClone is idempotent so this is also safe to call standalone).
   */
  async publishFiles(input: PublishInput): Promise<PublishResult> {
    const { git, path } = await this.ensureClone({
      siteId: input.siteId,
      repoUrl: input.repoUrl,
      branch: input.branch,
    });
    await git.addConfig("user.email", input.authorEmail, false, "local");
    await git.addConfig("user.name", input.authorName, false, "local");

    for (const file of input.files) {
      const target = join(path, file.relativePath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, "utf-8");
      await git.add(file.relativePath);
    }

    const commitResult = await git.commit(input.commitMessage);
    if (!commitResult.commit) {
      throw new Error(`Commit failed: ${JSON.stringify(commitResult)}`);
    }
    await git.push("origin", input.branch);
    return { commitSha: commitResult.commit, branch: input.branch };
  }
}
