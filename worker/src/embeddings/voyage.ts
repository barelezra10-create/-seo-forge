export async function embedText(input: string, apiKey: string): Promise<number[]>;
export async function embedText(input: string[], apiKey: string): Promise<number[][]>;
export async function embedText(
  input: string | string[],
  apiKey: string,
): Promise<number[] | number[][]> {
  const isBatch = Array.isArray(input);
  const inputs = isBatch ? input : [input];

  // Voyage free tier is 3 RPM. We retry on 429 with linear backoff (25s,
  // 50s, ...) up to ~3 minutes total. Once Bar adds a payment method on
  // dashboard.voyageai.com the retries become unreachable in practice.
  const maxAttempts = 7;
  let lastError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: inputs,
        model: "voyage-3.5-lite",
        input_type: "document",
      }),
    });

    if (res.ok) {
      const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
      const vectors = json.data.map((d) => d.embedding);
      return isBatch ? vectors : vectors[0]!;
    }

    const body = await res.text();
    lastError = `Voyage API error ${res.status}: ${body}`;

    if (res.status === 429 && attempt < maxAttempts) {
      const waitMs = 25_000 * attempt;
      console.log(`[voyage] 429, waiting ${waitMs / 1000}s (attempt ${attempt}/${maxAttempts})`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    // Non-retryable or out of attempts
    throw new Error(lastError);
  }
  throw new Error(lastError);
}
