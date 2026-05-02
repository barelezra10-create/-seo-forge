import { z } from "zod";

export const EnvSchema = z.object({
  DATABASE_URL: z.string().url().refine((s) => s.startsWith("postgres://") || s.startsWith("postgresql://")),
  VOYAGE_API_KEY: z.string().min(1),
  AHREFS_API_KEY: z.string().min(1),
  GSC_REFRESH_TOKEN: z.string().min(1),
  GSC_CLIENT_ID: z.string().min(1),
  GSC_CLIENT_SECRET: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  GH_PAT_MCA_GUIDE: z.string().min(1),
  WORKSPACE_REPOS_DIR: z.string().min(1).default("./workspace/repos"),
  DASHBOARD_PASSWORD: z.string().min(8),
  DASHBOARD_SESSION_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(raw: Record<string, string | undefined>): Env {
  return EnvSchema.parse(raw);
}
