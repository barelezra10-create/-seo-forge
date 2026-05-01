export async function exchangeRefreshToken(o: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: o.clientId,
      client_secret: o.clientSecret,
      refresh_token: o.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`GSC token exchange failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { access_token: string };
  return j.access_token;
}

export type StrikingDistanceQuery = {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export async function fetchStrikingDistanceQueries(o: {
  siteUrl: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  days: number;
  minPosition: number;
  maxPosition: number;
  minImpressions: number;
}): Promise<StrikingDistanceQuery[]> {
  const accessToken = await exchangeRefreshToken({
    refreshToken: o.refreshToken,
    clientId: o.clientId,
    clientSecret: o.clientSecret,
  });
  const end = new Date();
  const start = new Date(end.getTime() - o.days * 24 * 60 * 60 * 1000);
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(o.siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        dimensions: ["query"],
        rowLimit: 1000,
      }),
    },
  );
  if (!res.ok) throw new Error(`GSC query failed: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as {
    rows?: Array<{ keys: [string]; clicks: number; impressions: number; ctr: number; position: number }>;
  };
  return (j.rows ?? [])
    .filter(
      (r) =>
        r.position >= o.minPosition &&
        r.position <= o.maxPosition &&
        r.impressions >= o.minImpressions,
    )
    .map((r) => ({
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
    }));
}
