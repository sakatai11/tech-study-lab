import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { releasePlan } from './deployment-changes.mjs'
import { assertWorkflowContext, lastRelease } from './deployment-lib.mjs'

const environment = process.argv[2]
assertWorkflowContext(environment, process.env)
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const plan = releasePlan(sha, await lastRelease(environment), {
  force: process.env.FORCE_FULL === 'true',
})
const deploy = plan.workers.api || plan.workers.web
if (process.env.GITHUB_OUTPUT)
  appendFileSync(process.env.GITHUB_OUTPUT, `deploy=${deploy}\nplan=${JSON.stringify(plan)}\n`)
const summary = `Release scope (${environment}): api=${plan.workers.api}, web=${plan.workers.web}; baseline=${plan.baseline?.sha ?? 'none'}; reason=${plan.reason}`
console.info(summary)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
