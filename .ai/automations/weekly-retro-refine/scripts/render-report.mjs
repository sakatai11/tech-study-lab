#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)

if (args.includes('--help') || args.length === 0) {
  console.log('Usage: node render-report.mjs --input <report.json> --output <report.html>')
  process.exit(args.length === 0 ? 1 : 0)
}

function valueAfter(flag) {
  const index = args.indexOf(flag)
  if (index === -1 || !args[index + 1]) {
    throw new Error(`Missing required argument: ${flag}`)
  }
  return args[index + 1]
}

function text(value, fallback = '') {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback
}

function list(value) {
  return Array.isArray(value) ? value : []
}

function escapeHtml(value) {
  return text(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function safeUrl(value) {
  const rawValue = text(value).trim()

  if (rawValue && !rawValue.startsWith('//') && !/^[a-z][a-z\d+.-]*:/i.test(rawValue)) {
    return escapeHtml(rawValue)
  }

  try {
    const url = new URL(rawValue)
    return url.protocol === 'https:' || url.protocol === 'http:' ? escapeHtml(url.href) : '#'
  } catch {
    return '#'
  }
}

const allowedTones = new Set(['good', 'info', 'warn', 'danger', 'neutral'])

function tone(value, fallback = 'neutral') {
  return allowedTones.has(value) ? value : fallback
}

function empty(message) {
  return `<p class="empty">${escapeHtml(message)}</p>`
}

function renderBadges(items) {
  return list(items).length
    ? list(items)
        .map((item) => `<span class="badge">${escapeHtml(item)}</span>`)
        .join('')
    : '<span class="badge">情報源なし</span>'
}

function renderSummary(items) {
  return list(items).length
    ? `<ol class="summary-list">${list(items)
        .slice(0, 5)
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')}</ol>`
    : empty('要約できる事実がありません。')
}

function renderMetrics(items) {
  if (!list(items).length) return ''
  const cards = list(items)
    .map(
      (item) => `
    <article class="metric ${tone(item.tone, 'good')}">
      <span class="metric-label">${escapeHtml(item.label)}</span>
      <strong class="metric-value">${escapeHtml(item.value)}</strong>
      <span class="metric-detail">${escapeHtml(item.detail)}</span>
    </article>`,
    )
    .join('')
  return `<div class="metrics">${cards}</div>`
}

function renderLimitations(items) {
  return list(items).length
    ? `<aside class="limitations"><strong>確認上の制約</strong><ul>${list(items)
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join('')}</ul></aside>`
    : ''
}

function renderSimpleCards(items, emptyMessage) {
  return list(items).length
    ? list(items)
        .map(
          (item) => `
      <article class="card">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.summary)}</p>
        ${item.evidence ? `<p class="evidence-text"><strong>根拠:</strong> ${escapeHtml(item.evidence)}</p>` : ''}
      </article>`,
        )
        .join('')
    : empty(emptyMessage)
}

const decisionTone = {
  採用: 'good',
  見送り: 'warn',
  過剰: 'neutral',
}

function renderProblems(items) {
  return list(items).length
    ? list(items)
        .map(
          (item) => `
      <article class="card">
        <span class="status ${decisionTone[item.decision] ?? 'neutral'}">${escapeHtml(item.decision || '未判定')}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.summary)}</p>
        <dl class="detail-list">
          <dt>証拠</dt><dd>${escapeHtml(item.evidence || '未確認')}</dd>
          <dt>根本原因</dt><dd>${escapeHtml(item.rootCause || '未確認')}</dd>
          <dt>既存対策</dt><dd>${escapeHtml(item.harnessCoverage || '未確認')}</dd>
          <dt>判断理由</dt><dd>${escapeHtml(item.reason || '未記載')}</dd>
          <dt>適用候補</dt><dd>${escapeHtml(item.target || 'なし')}</dd>
        </dl>
      </article>`,
        )
        .join('')
    : empty('実害と再発性を確認できるProblemはありません。')
}

const readinessTone = {
  Ready: 'good',
  'Needs refinement': 'warn',
  Blocked: 'danger',
  Defer: 'neutral',
}

function renderIssues(items) {
  if (!list(items).length) return empty('対象となる既存Issueはありません。')
  const rows = list(items)
    .map((item) => {
      const issueNumber = escapeHtml(item.number || '—')
      const title = escapeHtml(item.title || '無題')
      const linkedTitle = item.url ? `<a href="${safeUrl(item.url)}">${title}</a>` : title
      return `
      <tr>
        <td>#${issueNumber}</td>
        <td class="issue-title">${linkedTitle}<span class="issue-note">${escapeHtml(item.summary)}</span></td>
        <td><span class="status ${readinessTone[item.readiness] ?? 'neutral'}">${escapeHtml(item.readiness || '未判定')}</span></td>
        <td>${escapeHtml(item.priority || '未判定')}</td>
        <td>${escapeHtml(list(item.gaps).join(' / ') || 'なし')}</td>
        <td>${escapeHtml(list(item.dependencies).join(' / ') || 'なし')}</td>
        <td>${escapeHtml(item.nextAction || 'なし')}</td>
      </tr>`
    })
    .join('')
  return `
    <table>
      <thead><tr><th>Issue</th><th>概要</th><th>準備状態</th><th>優先度</th><th>不足</th><th>依存</th><th>次の対応</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
}

const normalIssueClassificationTone = {
  close候補: 'good',
  残条件あり: 'warn',
  別Issueへ移管済み: 'info',
}

function renderLink(item, fallback) {
  const title = escapeHtml(item?.title || fallback)
  return item?.url ? `<a href="${safeUrl(item.url)}">${title}</a>` : title
}

function renderIssueReference(item, fallback) {
  const number = text(item?.number)
  const label = renderLink(item, fallback)
  return number ? `#${escapeHtml(number)} ${label}` : label
}

function renderNormalIssueReconciliation(items) {
  if (!list(items).length) return empty('照合対象となる通常Issueはありません。')

  return list(items)
    .map((item) => {
      const issue = item?.issue && typeof item.issue === 'object' ? item.issue : {}
      const pullRequests = list(item?.pullRequests)
      const completionCriteria = list(item?.completionCriteria)
      const remainingConditions = list(item?.remainingConditions)
      const parentTrackers = list(item?.parentTrackers)
      const transfer = item?.transfer && typeof item.transfer === 'object' ? item.transfer : null
      const issueLabel = `#${escapeHtml(issue.number || '—')} ${renderLink(issue, '無題')}`
      const pullRequestRows = pullRequests.length
        ? pullRequests
            .map(
              (pullRequest) =>
                `<li>${renderLink(pullRequest, `PR #${escapeHtml(pullRequest?.number || '—')}`)} · ${escapeHtml(pullRequest?.reference || '参照未確認')} · merge先: ${escapeHtml(pullRequest?.mergeTarget || '未確認')}<span class="issue-note">${escapeHtml(pullRequest?.evidence || '根拠未確認')}</span></li>`,
            )
            .join('')
        : '<li>関連するmerge済みPRは未確認です。</li>'
      const criteriaRows = completionCriteria.length
        ? completionCriteria
            .map(
              (criterion) =>
                `<li><strong>${escapeHtml(criterion?.status || '未確認')}</strong>: ${escapeHtml(criterion?.criterion || '完了条件未記載')}<span class="issue-note">${escapeHtml(criterion?.evidence || '根拠未確認')}</span></li>`,
            )
            .join('')
        : '<li>完了条件の照合結果は未確認です。</li>'
      const transferDetail = transfer
        ? `${renderIssueReference(transfer, '移管先Issue')} — ${escapeHtml(transfer.unmetCriteria || '対応する未達条件は未確認')}`
        : 'なし'
      const trackerRows = parentTrackers.length
        ? parentTrackers
            .map(
              (tracker) =>
                `<li>${renderIssueReference(tracker, '親tracker')} (${escapeHtml(tracker?.relation || '明示関係')}) — 子Issue: ${escapeHtml(tracker?.childClassification || item?.classification || '未判定')}</li>`,
            )
            .join('')
        : '<li>明示された親trackerはありません。</li>'

      return `
      <article class="card reconciliation-card">
        <span class="status ${normalIssueClassificationTone[item?.classification] ?? 'neutral'}">${escapeHtml(item?.classification || '未判定')}</span>
        <h3>${issueLabel}</h3>
        <dl class="detail-list">
          <dt>関連PR・merge先</dt><dd><ul>${pullRequestRows}</ul></dd>
          <dt>完了条件の根拠</dt><dd><ul>${criteriaRows}</ul></dd>
          <dt>残条件</dt><dd>${escapeHtml(remainingConditions.join(' / ') || 'なし')}</dd>
          <dt>移管先</dt><dd>${transferDetail}</dd>
          <dt>親tracker</dt><dd><ul>${trackerRows}</ul></dd>
          <dt>人間の次アクション</dt><dd>${escapeHtml(item?.humanNextAction || '確認して判断する')}</dd>
        </dl>
      </article>`
    })
    .join('')
}

function renderNewIssues(items) {
  return list(items).length
    ? list(items)
        .map(
          (item) => `
      <article class="card">
        <span class="status info">${escapeHtml(item.type || '候補')}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.purpose)}</p>
        <dl class="detail-list">
          <dt>非重複の根拠</dt><dd>${escapeHtml(item.gapEvidence || '未確認')}</dd>
          <dt>完了条件案</dt><dd>${escapeHtml(list(item.acceptanceCriteria).join(' / ') || '未作成')}</dd>
          <dt>関連Issue</dt><dd>${escapeHtml(list(item.relatedIssues).join(' / ') || 'なし')}</dd>
        </dl>
      </article>`,
        )
        .join('')
    : empty('既存Issueで未カバーの新規候補はありません。')
}

function focusCard(label, item, statusTone) {
  return `
    <article class="card">
      <span class="status ${statusTone}">${escapeHtml(label)}</span>
      <h3>${escapeHtml(item?.title || '設定なし')}</h3>
      <p>${escapeHtml(item?.reason || '')}</p>
    </article>`
}

function renderFocus(value) {
  const focus = value && typeof value === 'object' ? value : {}
  const notDoing = list(focus.notDoing)
  const notDoingCard = `
    <article class="card">
      <span class="status neutral">今週やらない</span>
      ${notDoing.length ? `<ul>${notDoing.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<p>設定なし</p>'}
    </article>`
  return `${focusCard('主目標', focus.primary, 'good')}${focusCard('品質・保守', focus.maintenance, 'info')}${notDoingCard}`
}

function renderPriorityCandidates(items) {
  const candidates = list(items)
  if (candidates.length > 3) {
    throw new Error('Priority candidates must contain at most 3 items')
  }
  return candidates.length
    ? `<ol class="priority-list">${candidates
        .map(
          (item) => `
      <li>
        <strong>${escapeHtml(item?.title || '無題')}</strong>
        <p>${escapeHtml(item?.reason || '選定根拠未記載')}</p>
      </li>`,
        )
        .join('')}</ol>`
    : empty('優先候補はありません。')
}

function renderApprovals(items) {
  return list(items).length
    ? list(items)
        .map(
          (item, index) => `
      <article class="approval card">
        <span class="approval-id">${escapeHtml(item.id || index + 1)}</span>
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.action)}</p>
          <p class="evidence-text">${escapeHtml(item.reason)}</p>
        </div>
      </article>`,
        )
        .join('')
    : empty('承認が必要な変更提案はありません。')
}

const inputPath = path.resolve(valueAfter('--input'))
const outputPath = path.resolve(valueAfter('--output'))
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const templatePath = path.resolve(scriptDirectory, '../assets/report-template.html')

const [rawData, template] = await Promise.all([
  readFile(inputPath, 'utf8'),
  readFile(templatePath, 'utf8'),
])

const report = JSON.parse(rawData)
if (!report || typeof report !== 'object' || !report.meta || typeof report.meta !== 'object') {
  throw new Error('Invalid report data: meta object is required')
}

const replacements = {
  DOCUMENT_TITLE: escapeHtml(report.meta.title || 'Weekly Retro & Refinement'),
  REPORT_TITLE: escapeHtml(report.meta.title || 'Weekly Retro & Refinement'),
  PERIOD: escapeHtml(
    `${text(report.meta.periodStart, '期間不明')} — ${text(report.meta.periodEnd, '期間不明')}`,
  ),
  GENERATED_AT: escapeHtml(report.meta.generatedAt || '不明'),
  REPOSITORY: escapeHtml(report.meta.repository || '不明'),
  EVIDENCE_BADGES: renderBadges(report.meta.evidence),
  LIMITATIONS: renderLimitations(report.meta.limitations),
  SUMMARY: renderSummary(report.summary),
  METRICS: renderMetrics(report.metrics),
  KEEP: renderSimpleCards(report.keep, '継続対象はありません。'),
  PROBLEMS: renderProblems(report.problems),
  TRIES: renderSimpleCards(report.tries, '次週に試す項目はありません。'),
  ISSUES: renderIssues(report.issueRefinement),
  NORMAL_ISSUE_RECONCILIATION: renderNormalIssueReconciliation(report.normalIssueReconciliation),
  NEW_ISSUES: renderNewIssues(report.newIssueCandidates),
  FOCUS: renderFocus(report.focus),
  PRIORITY_CANDIDATES: renderPriorityCandidates(report.focus?.priorityCandidates),
  APPROVALS: renderApprovals(report.approvals),
}

const html = template.replace(/\{\{([A-Z_]+)\}\}/g, (placeholder, key) => {
  if (!Object.hasOwn(replacements, key)) {
    throw new Error(`Unresolved template placeholder: ${placeholder}`)
  }
  return replacements[key]
})

await mkdir(path.dirname(outputPath), { recursive: true })
await writeFile(outputPath, html, 'utf8')
console.log(outputPath)
