import { mkdir, stat, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";

export type PublishInput = {
  siteId: string;
  repoUrl: string;
  branch: string;
  relativeFilePath: string;
  fileContent: string;
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

  private repoPath(siteId: string): string {
    return join(this.opts.workspaceDir, siteId);
  }

  private async ensureClone(input: PublishInput): Promise<SimpleGit> {
    const path = this.repoPath(input.siteId);
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
    return git;
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    const git = await this.ensureClone(input);
    await git.addConfig("user.email", input.authorEmail, false, "local");
    await git.addConfig("user.name", input.authorName, false, "local");

    const path = this.repoPath(input.siteId);
    const target = join(path, input.relativeFilePath);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, input.fileContent, "utf-8");

    await git.add(input.relativeFilePath);
    const commitResult = await git.commit(input.commitMessage);
    if (!commitResult.commit) {
      throw new Error(`Commit failed: ${JSON.stringify(commitResult)}`);
    }
    await git.push("origin", input.branch);
    return { commitSha: commitResult.commit, branch: input.branch };
  }
}
