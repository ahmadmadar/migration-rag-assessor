// ui.js
// Renders assessment pipeline output: complexity badge, roadmap timeline,
// risk register, cost band, and the sources panel that proves grounding.
// Every roadmap/risk source_id renders as a link back to its card in the
// sources panel — that link is the whole point of the RAG pipeline being
// visible rather than just claimed.

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function severityClass(sev) {
  const s = (sev || '').toLowerCase();
  return ['low', 'medium', 'high'].includes(s) ? s : 'medium';
}

function complexityClass(score) {
  const n = Number(score) || 0;
  if (n <= 3) return 'low';
  if (n <= 6) return 'medium';
  return 'high';
}

function sourceTags(sourceIds) {
  if (!sourceIds?.length) {
    return '<span class="tag tag--empty">no source cited</span>';
  }
  return sourceIds
    .map((id) => `<a class="tag tag--source" href="#source-${escapeHtml(id)}">${escapeHtml(id)}</a>`)
    .join('');
}

function renderRoadmap(roadmap) {
  if (!roadmap?.length) {
    return '<p class="empty-note">No roadmap phases were generated.</p>';
  }
  return `
    <div class="timeline">
      ${roadmap
        .map(
          (phase, i) => `
        <div class="timeline__phase">
          <div class="timeline__index">${i + 1}</div>
          <div class="timeline__card">
            <h4>${escapeHtml(phase.phase)}</h4>
            <div class="timeline__duration">${escapeHtml(phase.duration)}</div>
            ${
              phase.activities?.length
                ? `<ul class="timeline__activities">${phase.activities
                    .map((a) => `<li>${escapeHtml(a)}</li>`)
                    .join('')}</ul>`
                : ''
            }
            <div class="tag-row">${sourceTags(phase.source_ids)}</div>
          </div>
        </div>`
        )
        .join('')}
    </div>
  `;
}

function renderRiskRegister(risks) {
  if (!risks?.length) {
    return '<p class="empty-note">No risks were generated.</p>';
  }
  return `
    <table class="risk-table">
      <thead>
        <tr><th>Risk</th><th>Severity</th><th>Mitigation</th><th>Sources</th></tr>
      </thead>
      <tbody>
        ${risks
          .map(
            (r) => `
          <tr class="risk-row risk-row--${severityClass(r.severity)}">
            <td>${escapeHtml(r.risk)}</td>
            <td><span class="badge badge--${severityClass(r.severity)}">${escapeHtml(r.severity)}</span></td>
            <td>${escapeHtml(r.mitigation)}</td>
            <td class="tag-row">${sourceTags(r.source_ids)}</td>
          </tr>`
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function renderSourcesPanel(retrievedDocs) {
  return `
    <div class="sources-panel">
      ${retrievedDocs
        .map(
          (r) => `
        <div class="source-card" id="source-${escapeHtml(r.doc.id)}">
          <div class="source-card__header">
            <span class="source-card__id">${escapeHtml(r.doc.id)}</span>
            <span class="source-card__score">${(r.score * 100).toFixed(1)}% match</span>
          </div>
          <h5>${escapeHtml(r.doc.title)}</h5>
          <div class="source-card__meta">${escapeHtml(r.doc.category)}</div>
          <div class="source-card__bar">
            <div class="source-card__bar-fill" style="width:${Math.max(0, Math.min(100, r.score * 100))}%"></div>
          </div>
        </div>`
        )
        .join('')}
    </div>
  `;
}

function renderGroundingNotice(issues) {
  if (!issues?.length) {
    return '<div class="notice notice--good">✓ Every roadmap phase and risk entry cites a valid retrieved source.</div>';
  }
  return `
    <div class="notice notice--warn">
      <strong>${issues.length} grounding issue(s) detected</strong>
      <ul>${issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
    </div>
  `;
}

export function clearResults(container) {
  container.innerHTML = '';
}

export function renderAssessment(container, scenario, retrievedDocs, assessment) {
  const cClass = complexityClass(assessment.complexity_score);
  container.innerHTML = `
    <section class="panel panel--summary">
      <div class="complexity-badge complexity-badge--${cClass}">
        <span class="complexity-badge__score">${escapeHtml(assessment.complexity_score)}</span>
        <span class="complexity-badge__max">/10</span>
      </div>
      <div class="complexity-rationale">
        <h3>Complexity Assessment</h3>
        <p>${escapeHtml(assessment.complexity_rationale)}</p>
      </div>
    </section>

    <section class="panel">
      <h3>Migration Roadmap</h3>
      ${renderRoadmap(assessment.roadmap)}
    </section>

    <section class="panel">
      <h3>Risk Register</h3>
      ${renderRiskRegister(assessment.risk_register)}
    </section>

    <section class="panel panel--cost">
      <h3>Estimated Cost Band</h3>
      <div class="cost-band">
        <span class="cost-band__low">${escapeHtml(assessment.cost_band?.low ?? '?')}</span>
        <span class="cost-band__sep">–</span>
        <span class="cost-band__high">${escapeHtml(assessment.cost_band?.high ?? '?')}</span>
      </div>
      <p class="cost-band__basis">${escapeHtml(assessment.cost_band?.basis ?? '')}</p>
    </section>

    <section class="panel panel--sources">
      <h3>Retrieved Sources <span class="panel__hint">— click any source tag above to jump here</span></h3>
      ${renderGroundingNotice(assessment._groundingIssues)}
      ${renderSourcesPanel(retrievedDocs)}
    </section>
  `;
}

export function renderError(container, message, { onRetry } = {}) {
  container.innerHTML = `
    <section class="panel panel--error">
      <h3>Something went wrong</h3>
      <p class="error-message">${escapeHtml(message)}</p>
      <button type="button" class="btn btn--retry" id="retry-btn">Retry</button>
    </section>
  `;
  if (onRetry) {
    container.querySelector('#retry-btn').addEventListener('click', onRetry);
  }
}

export function renderIncomplete(container, assessment, { onRetry } = {}) {
  const issues = assessment._completenessIssues || [];
  container.innerHTML = `
    <section class="panel panel--incomplete">
      <h3>Assessment Incomplete</h3>
      <p>Claude's response didn't include everything needed to render a full assessment. This is a known occasional failure mode — retrying usually resolves it.</p>
      <ul class="issue-list">${issues.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
      <button type="button" class="btn btn--retry" id="retry-btn">Retry</button>
      <details class="raw-response">
        <summary>Raw response (for diagnosis)</summary>
        <pre>${escapeHtml(assessment._rawResponseText || '')}</pre>
      </details>
    </section>
  `;
  if (onRetry) {
    container.querySelector('#retry-btn').addEventListener('click', onRetry);
  }
}
