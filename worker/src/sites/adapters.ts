import type { SiteAdapter } from "./adapter.js";
import { mcaGuideAdapter } from "./mca-guide/adapter.js";
import { bdiAdapter } from "./bdi/adapter.js";

export const ADAPTERS_BY_SITE_ID: Record<string, SiteAdapter> = {
  "mca-guide": mcaGuideAdapter,
  "bdi": bdiAdapter,
};
