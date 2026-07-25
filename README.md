# Migration Readiness Assessor (RAG-powered)

Client-side migration assessment tool: takes a legacy environment scenario as input, retrieves relevant migration playbook patterns via in-browser embeddings, and generates a grounded, structured assessment via the Claude API — with visible source attribution.

No backend required. Ships as a static site (GitHub Pages).

## Status

- [x] **Day 1 — Domain content & schemas.** `data/knowledge-base.json` (19 migration pattern docs), `data/scenario-schema.json`, `data/output-schema.json`.
- [x] **Day 2 — Embedding & retrieval.** `src/embeddings.js` (transformers.js wrapper), `src/retrieval.js` (cosine similarity + top-k + Risk Patterns category floor), `data/test-scenarios.json` (8 scenarios), `retrieval-test.html` (validation harness). Validated: 74% expected-doc recall (16/23) across the 8 test scenarios.
- [x] **Day 3 — Grounded generation.** `src/api.js` (Claude API call + JSON parsing + grounding validation + completeness validation against `output-schema.json`), `generation-test.html` (end-to-end validation harness). First validation run surfaced two real bugs, now fixed: (1) the batch loop aborted entirely on the first network error instead of isolating per-scenario failures, (2) the grounding check reported "clean" on responses that came back structurally empty, since it only validates citations on entries that exist rather than checking the response is populated at all — `validateCompleteness()` now checks that separately.
- [ ] **Day 4 — UI.** `index.html`, `src/app.js` (wiring), `src/ui.js` (rendering), `styles/style.css`.
- [ ] **Day 5 — Deploy & document.** GitHub Pages, final metrics, walkthrough recording.

## Project structure

```
migration-rag-assessor/
├── index.html               # entry point (Day 4)
├── retrieval-test.html      # standalone retrieval validation harness (built)
├── generation-test.html     # standalone generation + grounding validation harness (built)
├── src/
│   ├── embeddings.js        # transformers.js wrapper (built)
│   ├── retrieval.js         # cosine similarity + top-k + category floor + query builder (built)
│   ├── api.js               # Claude API call, JSON parsing, grounding validation (built)
│   ├── app.js                # wires input → retrieve → generate → render (Day 4)
│   └── ui.js                 # renders roadmap, risk table, sources panel (Day 4)
├── data/
│   ├── knowledge-base.json  # 19 migration pattern docs (built)
│   ├── scenario-schema.json # input field contract (built)
│   ├── output-schema.json   # Claude output contract, feeds system prompt (built)
│   └── test-scenarios.json  # 8 scenarios for retrieval + generation validation (built)
├── styles/
│   └── style.css             # (Day 4)
└── package.json
```

## Running locally

ES module imports and the JSON `fetch()` calls require a real server — `file://` will fail on CORS.

```bash
npm run dev
```

This runs `npx serve . -l 5500`. Then open:

- `http://localhost:5500/retrieval-test.html` — run retrieval validation (first load downloads the ~25MB embedding model, cached after)
- `http://localhost:5500/generation-test.html` — run end-to-end generation validation: retrieval + Claude API call + grounding check. Requires pasting your own Anthropic API key into the page (held in memory only, not persisted). Each run costs a small amount of real API credit.
- `http://localhost:5500/index.html` — the app itself, once Day 4 is built

## API key handling

This ships as a static site with no backend, so a Claude API key embedded in client JS would be publicly visible. Current plan: **bring-your-own-key** — a field in the UI where a visitor pastes their own Anthropic API key, held in memory only for the session, never sent anywhere but Anthropic. A serverless proxy (Cloudflare Worker / Vercel edge function) is a reasonable production-grade next step but is out of scope for the initial ship.

## Architecture notes

- **Knowledge base** (`data/knowledge-base.json`) is a static bundled asset, embedded once client-side on load, not regenerated per request.
- **`output-schema.json`** isn't runtime data — it's baked into the Day 3 system prompt as the JSON contract Claude must follow, including the rule that every roadmap phase and risk entry must cite `source_ids` from the retrieved docs actually used.
- **`scenario-schema.json`** documents the input contract; the Day 4 form is hardcoded to it rather than dynamically generated, to keep the build on schedule.
- **`retrieval.js`'s `scenarioToQuery()`** is shared between `retrieval-test.html` and the eventual `app.js`, so the validated retrieval behavior is exactly what ships — no drift between test and production.


