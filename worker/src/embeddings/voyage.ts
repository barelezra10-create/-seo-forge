export async function embedText(input: string, apiKey: string): Promise<number[]>;
export async function embedText(input: string[], apiKey: string): Promise<number[][]>;
export async function embedText(
  input: string | string[],
  apiKey: string,
): Promise<number[] | number[][]> {
  const isBatch = Array.isArray(input);
  const inputs = isBatch ? input : [input];

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

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Voyage API error ${res.status}: ${body}`);
  }

  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  const vectors = json.data.map((d) => d.embedding);
  return isBatch ? vectors : vectors[0]!;
}
