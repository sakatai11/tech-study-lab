import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const [cwd, output, extra = ''] = process.argv.slice(2)
if (!cwd || !output) throw new Error('cwd and output required')
mkdirSync(output, { recursive: true })
const start = new Date()
const prompt = `${readFileSync(new URL('./issue-33-common-prompt.txt', import.meta.url), 'utf8')}\n${extra}`
writeFileSync(path.join(output, 'prompt.txt'), prompt)
const args = [
  'exec',
  '--ignore-user-config',
  '--ephemeral',
  '--json',
  '-m',
  'gpt-5.6-sol',
  '-c',
  'model_reasoning_effort="xhigh"',
  '-s',
  'workspace-write',
  '-C',
  cwd,
  '-',
]
writeFileSync(
  path.join(output, 'invocation.json'),
  JSON.stringify({ executable: 'codex', args, startedAt: start.toISOString(), cwd }, null, 2),
)
const child = spawn('codex', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
child.stdin.end(prompt)
let pending = ''
const metrics = {
  usage: [],
  commands: 0,
  searches: 0,
  reads: 0,
  agentMessages: 0,
  errors: [],
  threadId: null,
}
const persist = () =>
  writeFileSync(
    path.join(output, 'metrics.json'),
    JSON.stringify(
      {
        ...metrics,
        startedAt: start.toISOString(),
        elapsedSeconds: (Date.now() - start.getTime()) / 1000,
      },
      null,
      2,
    ),
  )
function onLine(line) {
  let event
  try {
    event = JSON.parse(line)
  } catch {
    return
  }
  if (event.type === 'thread.started') metrics.threadId = event.thread_id
  if (event.type === 'turn.completed') metrics.usage.push(event.usage)
  const item = event.item
  if (event.type === 'item.completed' && item?.type === 'command_execution') {
    metrics.commands++
    if (/\b(rg|grep|find)\b/.test(item.command)) metrics.searches++
    if (/\b(cat|sed|head|tail)\b/.test(item.command)) metrics.reads++
    // Do not persist tool output: keep command and exit code only.
    appendFileSync(
      path.join(output, 'commands.jsonl'),
      `${JSON.stringify({ command: item.command, exitCode: item.exit_code })}\n`,
    )
    process.stdout.write(`command ${metrics.commands} exit=${item.exit_code}\n`)
  }
  if (event.type === 'item.completed' && item?.type === 'agent_message') {
    metrics.agentMessages++
    appendFileSync(path.join(output, 'messages.txt'), `${item.text}\n\n`)
    process.stdout.write(`${item.text.slice(0, 1600)}\n`)
  }
  if (event.type === 'turn.failed' || event.type === 'error' || item?.type === 'error') {
    metrics.errors.push(event.error?.message ?? item?.message ?? event.message ?? event.type)
  }
  persist()
}
child.stdout.on('data', (chunk) => {
  pending += chunk.toString()
  let index = pending.indexOf('\n')
  while (index >= 0) {
    onLine(pending.slice(0, index))
    pending = pending.slice(index + 1)
    index = pending.indexOf('\n')
  }
})
// Only display stderr; do not persist raw runtime output.
child.stderr.on('data', (chunk) => process.stderr.write(chunk))
child.on('error', (error) => {
  metrics.errors.push(error.message)
  persist()
})
child.on('close', (code) => {
  if (pending) onLine(pending)
  metrics.exitCode = code
  metrics.completedAt = new Date().toISOString()
  persist()
  process.stdout.write(`${JSON.stringify(metrics)}\n`)
  process.exitCode = code ?? 1
})
