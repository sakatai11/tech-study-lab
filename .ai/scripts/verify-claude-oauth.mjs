import { spawnSync } from 'node:child_process'

// Query the effective credential source with the same settings as the review.
// Keep permissions and hooks enabled; never log the CLI's account metadata.
const authOptions = []
const valueOptions = ['--settings', '--setting-sources']
const modeOptions = ['--safe-mode', '--restricted', '--bare']
const switchOptions = [
  ...modeOptions,
  '-p',
  '--print',
  '--verbose',
  '--strict-mcp-config',
  '--no-session-persistence',
]
function rejectAuthentication() {
  console.error(
    'error: Claude review requires dedicated OAuth token authentication; check conflicting CLI credential settings and option values',
  )
  process.exit(1)
}

const args = process.argv.slice(2)
for (let index = 0; index < args.length; index++) {
  const arg = args[index]
  const authOption =
    valueOptions.includes(arg) ||
    valueOptions.some((option) => arg.startsWith(`${option}=`)) ||
    modeOptions.includes(arg) ||
    arg === '--'
  const previous = args[index - 1]
  // Do not mistake an option's literal value for a settings/mode switch.
  if (
    authOption &&
    previous?.startsWith('-') &&
    !previous.includes('=') &&
    !switchOptions.includes(previous)
  ) {
    rejectAuthentication()
  }
  if (arg === '--') break
  if (valueOptions.includes(arg)) {
    if (index + 1 >= args.length) rejectAuthentication()
    authOptions.push(arg, args[++index])
  } else if (
    valueOptions.some((option) => arg.startsWith(`${option}=`)) ||
    modeOptions.includes(arg)
  ) {
    authOptions.push(arg)
  }
}

const result = spawnSync('claude', [...authOptions, 'auth', 'status', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: 60_000,
  maxBuffer: 1024 * 1024,
})

let authenticated = false
if (!result.error && result.status === 0) {
  try {
    const status = JSON.parse(result.stdout)
    authenticated =
      status.loggedIn === true &&
      status.authMethod === 'oauth_token' &&
      status.apiProvider === 'firstParty'
  } catch {
    // An unknown or malformed status must never allow a review to start.
  }
}

if (!authenticated) {
  rejectAuthentication()
}
