// api.js
// Calls the Claude API directly from the browser using a user-supplied API key.
// Bring-your-own-key by design: this ships as a static site with no backend,
// so there's no way to hold a secret server-side. The key lives in a JS
// variable for the current page session only — never written to localStorage,
// never sent anywhere but api.anthropic.com.
//
// NOTE: model strings change over time — check docs.anthropic.com for the
// current recommended model before relying on this in a live demo.
const MODEL = 'claude-sonnet-5';
const API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_TOKENS = 4096;

let sessionApiKey = null;

export function setApiKey(key) {
  sessionApiKey = key?.trim() || null;
}

export function hasApiKey() {
  return !!sessionApiKey;
}

export function clearApiKey() {
  sessionApiKey = null;
}

function buildSystemPrompt(outputSchema) {
  return `You are a migration assessment engine used by an enterprise technology consultant to produce structured, grounded migration readiness assessments.

Rules you MUST follow:
1. Base your assessment ONLY on the user's scenario and the retrieved migration pattern documents provided below. Do not draw on outside general knowledge of migration best practices beyond what is in the retrieved documents.
2. Every entry in "roadmap" and every entry in "risk_register" MUST include a "source_ids" array citing which retrieved document id(s) informed it. Never invent a source_id that was not in the retrieved set provided to you.
3. If no retrieved document supports a recommendation you would otherwise want to make, omit that recommendation rather than generating it ungrounded.
4. Respond with valid JSON only. No markdown code fences, no preamble, no text outside the JSON object.

Output must match this exact schema:
${JSON.stringify(outputSchema, null, 2)}`;
}

function buildUserMessage(scenario, retrievedDocs) {
  const docsBlock = retrievedDocs
    .map(
      (r) => `[${r.doc.id}] ${r.doc.title} (category: ${r.doc.category}, relevance: ${r.score.toFixed(3)})
${r.doc.content}`
    )
    .join('\n---\n');

  return `SCENARIO:
${JSON.stringify(scenario, null, 2)}

RETRIEVED MIGRATION PATTERN DOCUMENTS:
${docsBlock}

Generate the migration readiness assessment as JSON per the schema and rules in your system prompt.`;
}

function cleanJsonResponse(text) {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

async function fetchWithRetry(url, options, retries = 2, backoffMs = 1000) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetch(url, options);
    } catch (err) {
      if (attempt === retries) {
        throw new Error(`Network request failed after ${retries + 1} attempt(s): ${err.message}`);
      }
      await new Promise((r) => setTimeout(r, backoffMs * (attempt + 1)));
    }
  }
}

export async function generateAssessment(scenario, retrievedDocs, outputSchema) {
  if (!sessionApiKey) {
    throw new Error('No API key set. Call setApiKey() first.');
  }

  const response = await fetchWithRetry(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': sessionApiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(outputSchema),
      messages: [{ role: 'user', content: buildUserMessage(scenario, retrievedDocs) }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Claude API error (${response.status}): ${errText || response.statusText}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find((b) => b.type === 'text');
  if (!textBlock) {
    throw new Error('No text content in Claude response.');
  }

  const cleaned = cleanJsonResponse(textBlock.text);
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Failed to parse Claude's response as JSON: ${err.message}\n\nRaw response:\n${cleaned}`);
  }

  parsed._groundingIssues = validateAssessment(parsed, retrievedDocs);
  parsed._completenessIssues = validateCompleteness(parsed);
  parsed._rawResponseText = textBlock.text;
  return parsed;
}

export function validateCompleteness(assessment) {
  const issues = [];
  if (typeof assessment.complexity_score !== 'number') {
    issues.push('complexity_score is missing or not a number');
  }
  if (!Array.isArray(assessment.roadmap) || assessment.roadmap.length === 0) {
    issues.push('roadmap is missing or empty');
  }
  if (!Array.isArray(assessment.risk_register) || assessment.risk_register.length === 0) {
    issues.push('risk_register is missing or empty');
  }
  if (!assessment.cost_band || !assessment.cost_band.low || !assessment.cost_band.high) {
    issues.push('cost_band is missing or incomplete');
  }
  return issues;
}

export function validateAssessment(assessment, retrievedDocs) {
  const validIds = new Set(retrievedDocs.map((r) => r.doc.id));
  const issues = [];

  const checkEntries = (entries, label) => {
    (entries || []).forEach((entry, i) => {
      const cited = entry.source_ids || [];
      if (cited.length === 0) {
        issues.push(`${label}[${i}] has no source_ids`);
      }
      cited.forEach((id) => {
        if (!validIds.has(id)) {
          issues.push(`${label}[${i}] cites unknown source_id "${id}"`);
        }
      });
    });
  };

  checkEntries(assessment.roadmap, 'roadmap');
  checkEntries(assessment.risk_register, 'risk_register');

  return issues;
}
