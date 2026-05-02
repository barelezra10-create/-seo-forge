export type OpportunityType = "striking_distance" | "traffic_decline" | "content_gap" | "broken_link";

export type OpportunityDraft = {
  siteId: string;
  type: OpportunityType;
  title: string;
  description: string;
  /** Type-specific data, keyword, page, target site, etc. */
  payload: Record<string, unknown>;
  /** Stable identity key used for deduplication. Same key = same opportunity. */
  dedupKey: string;
};
