// app.js
// Wires the form to the already-validated retrieval + generation pipeline:
// form → retrieveTopK (retrieval.js) → generateAssessment (api.js) → ui.js.

import { buildIndex, retrieveTopK, scenarioToQuery } from './retrieval.js';
import { setApiKey, generateAssessment } from './api.js';
import { clearResults, renderAssessment, renderError, renderIncomplete } from './ui.js';

const form = document.getElementById('scenario-form');
const apiKeyInput = document.getElementById('api-key');
const submitBtn = document.getElementById('submit-btn');
const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');
const resultsEl = document.getElementById('results');

let outputSchema = null;
let indexReady = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setStatus(text) {
  statusText.textContent = text;
  statusBar.classList.toggle('is-active', !!text);
}

async function ensureOutputSchema() {
  if (!outputSchema) {
    const res = await fetch('./data/output-schema.json');
    outputSchema = await res.json();
  }
  return outputSchema;
}

function readScenarioFromForm() {
  const fd = new FormData(form);
  const compliance = fd.getAll('compliance_constraints');
  return {
    environment_summary: (fd.get('environment_summary') || '').trim(),
    app_count: Number(fd.get('app_count')) || 0,
    data_volume_estimate: (fd.get('data_volume_estimate') || '').trim(),
    compliance_constraints: compliance.length ? compliance : ['None'],
    integration_complexity: fd.get('integration_complexity') || '',
    team_size: Number(fd.get('team_size')) || 0,
    timeline_target: (fd.get('timeline_target') || '').trim(),
  };
}

async function runAssessment(scenario, apiKey) {
  submitBtn.disabled = true;
  clearResults(resultsEl);

  const retry = () => runAssessment(scenario, apiKey);

  try {
    setApiKey(apiKey);
    const schema = await ensureOutputSchema();

    if (!indexReady) {
      setStatus('Loading migration pattern knowledge base…');
      await buildIndex('./data/knowledge-base.json');
      indexReady = true;
    }

    setStatus('Embedding scenario…');
    await sleep(350);

    setStatus('Retrieving relevant patterns…');
    const query = scenarioToQuery(scenario);
    const retrievedDocs = await retrieveTopK(query);

    setStatus('Generating assessment…');
    const assessment = await generateAssessment(scenario, retrievedDocs, schema);

    setStatus('');

    if (assessment._completenessIssues?.length) {
      renderIncomplete(resultsEl, assessment, { onRetry: retry });
    } else {
      renderAssessment(resultsEl, scenario, retrievedDocs, assessment);
    }
  } catch (err) {
    console.error(err);
    setStatus('');
    renderError(resultsEl, err.message, { onRetry: retry });
  } finally {
    submitBtn.disabled = false;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    setStatus('Enter your Anthropic API key first.');
    apiKeyInput.focus();
    return;
  }

  const scenario = readScenarioFromForm();
  if (!scenario.environment_summary || !scenario.integration_complexity) {
    setStatus('Fill in all required fields before generating an assessment.');
    return;
  }

  runAssessment(scenario, apiKey);
});
