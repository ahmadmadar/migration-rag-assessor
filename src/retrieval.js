// retrieval.js
// Builds an in-memory vector index from knowledge-base.json and retrieves
// the top-k most relevant pattern docs for a given scenario query.

import { embedText, embedBatch } from './embeddings.js';

let index = null;

export function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function docToEmbeddingText(doc) {
  return `${doc.title}. ${doc.content} Tags: ${doc.tags.join(', ')}`;
}

export async function buildIndex(kbPath = './data/knowledge-base.json') {
  const res = await fetch(kbPath);
  const docs = await res.json();
  const texts = docs.map(docToEmbeddingText);
  const vectors = await embedBatch(texts);
  index = { docs, vectors };
  return index;
}

/**
 * Includes a category-floor guarantee: validation showed every doc in the
 * "Risk Patterns" category got missed at least once in top-k retrieval —
 * those docs describe abstract failure patterns rather than concrete
 * technology nouns, so they sit systematically further from scenario text.
 * This guarantees at least one Risk Patterns doc is included, swapping in
 * the best-scoring one from that category if none made the natural top-k.
 */
export async function retrieveTopK(query, k = 5, options = {}) {
  const { guaranteeCategories = ['Risk Patterns'] } = options;
  if (!index) {
    throw new Error('Index not built yet — call buildIndex() before retrieveTopK().');
  }
  const queryVector = await embedText(query);
  const scored = index.docs.map((doc, i) => ({
    doc,
    score: cosineSimilarity(queryVector, index.vectors[i]),
  }));
  scored.sort((a, b) => b.score - a.score);

  const selected = scored.slice(0, k);

  for (const category of guaranteeCategories) {
    const alreadyCovered = selected.some(s => s.doc.category === category);
    if (!alreadyCovered) {
      const bestInCategory = scored.find(s => s.doc.category === category);
      if (bestInCategory) {
        selected[selected.length - 1] = bestInCategory;
      }
    }
  }

  selected.sort((a, b) => b.score - a.score);
  return selected;
}

export function getIndexSize() {
  return index ? index.docs.length : 0;
}

export function scenarioToQuery(scenario) {
  const parts = [scenario.environment_summary];
  if (scenario.compliance_constraints?.length) {
    parts.push(`Compliance constraints: ${scenario.compliance_constraints.join(', ')}.`);
  }
  if (scenario.integration_complexity) {
    parts.push(`Integration complexity: ${scenario.integration_complexity}.`);
  }
  if (scenario.app_count) {
    parts.push(`Scope: ${scenario.app_count} applications/sites.`);
  }
  return parts.join(' ');
}
