// embeddings.js
// Client-side text embeddings via transformers.js — no server, no API cost.
// Model: Xenova/all-MiniLM-L6-v2 (quantized, ~25MB, 384-dim output)

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

env.useBrowserCache = true;
env.allowLocalModels = false;

let extractorPromise = null;

export function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
      quantized: true,
    });
  }
  return extractorPromise;
}

export async function embedText(text) {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return output.data;
}

export async function embedBatch(texts) {
  const vectors = [];
  for (const text of texts) {
    vectors.push(await embedText(text));
  }
  return vectors;
}
