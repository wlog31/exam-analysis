const { app, BrowserWindow, dialog, shell, ipcMain } = require('electron')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { execFile } = require('node:child_process')

const STATIC_BASE = '/examAnalysis'
const LOCAL_PORT = 4785
let staticServer = null

const CLI_TIMEOUT_MS = 60_000
const CLI_MAX_BUFFER = 4 * 1024 * 1024

function getPathKey(env) {
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') ||
    (process.platform === 'win32' ? 'Path' : 'PATH')
}

function cleanPathEntry(entry) {
  return entry.trim().replace(/^"|"$/g, '')
}

function mergePathEntries(entries) {
  const seen = new Set()
  const result = []

  for (const entry of entries) {
    if (!entry) continue
    const cleaned = cleanPathEntry(entry)
    if (!cleaned) continue

    const key = process.platform === 'win32' ? cleaned.toLowerCase() : cleaned
    if (seen.has(key)) continue
    seen.add(key)
    result.push(cleaned)
  }

  return result
}

function parseDotEnvValue(value) {
  const trimmed = value.trim()
  const quote = trimmed[0]

  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
  }

  return trimmed
}

function readDotEnvFile() {
  const envPath = path.join(__dirname, '..', '.env')
  const values = {}

  try {
    const contents = fs.readFileSync(envPath, 'utf8')
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!match) continue
      values[match[1]] = parseDotEnvValue(match[2])
    }
  } catch {
    // The CLI can still use credentials from each tool's own login state.
  }

  return values
}

function applyCliApiKeyAliases(env) {
  const dotEnv = readDotEnvFile()

  for (const [key, value] of Object.entries(dotEnv)) {
    if (env[key] === undefined) env[key] = value
  }

  const aliases = {
    VITE_ANTHROPIC_API_KEY: 'ANTHROPIC_API_KEY',
    VITE_OPENAI_API_KEY: 'OPENAI_API_KEY',
    VITE_GEMINI_API_KEY: 'GEMINI_API_KEY',
  }

  for (const [source, target] of Object.entries(aliases)) {
    if (env[source] && !env[target]) env[target] = env[source]
  }

  const geminiOauthPath = path.join(env.USERPROFILE || '', '.gemini', 'oauth_creds.json')
  if (!env.GEMINI_API_KEY && !env.GOOGLE_GENAI_USE_VERTEXAI && !env.GOOGLE_GENAI_USE_GCA && isFile(geminiOauthPath)) {
    env.GOOGLE_GENAI_USE_GCA = 'true'
  }
}

function createCliEnv() {
  const env = { ...process.env }
  applyCliApiKeyAliases(env)
  env.GEMINI_CLI_TRUST_WORKSPACE = env.GEMINI_CLI_TRUST_WORKSPACE || 'true'
  const pathKey = getPathKey(env)
  const currentPath = env[pathKey] || ''
  const extraPathEntries = []

  if (process.platform === 'win32') {
    if (env.APPDATA) extraPathEntries.push(path.join(env.APPDATA, 'npm'))
    if (env.LOCALAPPDATA) {
      extraPathEntries.push(path.join(env.LOCALAPPDATA, 'Microsoft', 'WindowsApps'))
    }
    if (env.ProgramFiles) extraPathEntries.push(path.join(env.ProgramFiles, 'nodejs'))
  } else {
    if (env.HOME) {
      extraPathEntries.push(path.join(env.HOME, '.npm-global', 'bin'))
      extraPathEntries.push(path.join(env.HOME, '.local', 'bin'))
      extraPathEntries.push(path.join(env.HOME, '.cargo', 'bin'))
    }
    extraPathEntries.push('/opt/homebrew/bin', '/usr/local/bin')
  }

  const mergedPath = mergePathEntries([
    ...extraPathEntries,
    ...currentPath.split(path.delimiter),
  ]).join(path.delimiter)

  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === 'path' && key !== pathKey) delete env[key]
  }

  env[pathKey] = mergedPath
  return env
}

function getPathEntries(env) {
  return (env[getPathKey(env)] || '')
    .split(path.delimiter)
    .map(cleanPathEntry)
    .filter(Boolean)
}

function isFile(filePath) {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function isPathLike(command) {
  return command.includes('/') || command.includes('\\')
}

function getCommandCandidates(command) {
  if (process.platform !== 'win32' || path.extname(command)) return [command]
  return ['.cmd', '.exe', '.bat', '.com', ''].map((ext) => `${command}${ext}`)
}

function resolveCommand(command, env) {
  const candidates = getCommandCandidates(command)

  if (isPathLike(command)) {
    const resolvedCandidates = candidates.map((candidate) =>
      path.isAbsolute(candidate) ? candidate : path.resolve(candidate)
    )
    return resolvedCandidates.find(isFile) || resolvedCandidates[0]
  }

  for (const pathEntry of getPathEntries(env)) {
    for (const candidate of candidates) {
      const fullPath = path.join(pathEntry, candidate)
      if (isFile(fullPath)) return fullPath
    }
  }

  return command
}

function parseCommandTemplate(template) {
  const tokens = []
  let token = ''
  let quote = null

  for (let index = 0; index < template.length; index += 1) {
    const char = template[index]

    if (quote) {
      if (char === quote) {
        quote = null
      } else if (quote === '"' && char === '\\' && index + 1 < template.length) {
        index += 1
        token += template[index]
      } else {
        token += char
      }
      continue
    }

    if (char === '"' || char === "'") {
      quote = char
      continue
    }

    if (/\s/.test(char)) {
      if (token) {
        tokens.push(token)
        token = ''
      }
      continue
    }

    token += char
  }

  if (quote) throw new Error('CLI command template contains an unclosed quote.')
  if (token) tokens.push(token)
  return tokens
}

function fillCommandTokens(template, model, prompt) {
  return parseCommandTemplate(template).map((token) =>
    token
      .replace(/\{prompt\}/g, prompt || '')
      .replace(/\{model\}/g, model || '')
  )
}

function getNodeScriptFromCmdShim(commandPath) {
  if (process.platform !== 'win32' || !/\.cmd$/i.test(commandPath)) return null

  try {
    const shim = fs.readFileSync(commandPath, 'utf8')
    const match = shim.match(/"%_prog%"\s+"([^"]+)"/i)
    if (!match) return null

    const shimDir = path.dirname(commandPath)
    const scriptPath = match[1].replace(/%dp0%[\\/]?/gi, `${shimDir}${path.sep}`)
    return isFile(scriptPath) ? scriptPath : null
  } catch {
    return null
  }
}

function prepareCommand(command, args, env) {
  const resolvedCommand = resolveCommand(command, env)
  const nodeScript = getNodeScriptFromCmdShim(resolvedCommand)

  if (nodeScript) {
    return {
      command: resolveCommand('node', env),
      args: [nodeScript, ...args],
      resolvedCommand,
    }
  }

  return {
    command: resolvedCommand,
    args,
    resolvedCommand,
  }
}

function getCliName(command) {
  return path.basename(command).replace(/\.(cmd|exe|bat|com)$/i, '').toLowerCase()
}

function hasAnyArg(args, names) {
  return args.some((arg) => names.includes(arg))
}

function removePromptArg(args, prompt) {
  if (!prompt) return [...args]
  return args.filter((arg) => arg !== prompt)
}

function removeOptionWithValue(args, optionNames) {
  const result = []
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (!optionNames.includes(arg)) {
      result.push(arg)
      continue
    }

    const next = args[index + 1]
    if (next && !next.startsWith('-')) index += 1
  }
  return result
}

function hasOption(args, optionNames) {
  return args.some((arg) =>
    optionNames.includes(arg) ||
    optionNames.some((option) => arg.startsWith(`${option}=`))
  )
}

function addModelArg(args, model, longOption = '--model') {
  if (!model || hasOption(args, [longOption, '-m'])) return args
  return [longOption, model, ...args]
}

function normalizeGeminiModel(model) {
  switch (model) {
    case 'gemini-2.0-flash':
    case 'gemini-1.5-flash':
      return 'flash'
    case 'gemini-1.5-pro':
      return 'pro'
    default:
      return model
  }
}

function normalizeCliInvocation(command, args, model, prompt) {
  const cliName = getCliName(command)
  const stdin = typeof prompt === 'string' && prompt.trim() ? prompt : ''
  let normalizedArgs = removePromptArg(args, stdin)

  if (cliName === 'claude') {
    if (!hasAnyArg(normalizedArgs, ['--print', '-p'])) {
      normalizedArgs.unshift('--print')
    }
    normalizedArgs = addModelArg(normalizedArgs, model)
    if (stdin) normalizedArgs.push(stdin)
    return { args: normalizedArgs, stdin: '' }
  }

  if (cliName === 'codex') {
    const subcommand = normalizedArgs[0]
    if (!['exec', 'e', 'review'].includes(subcommand)) {
      normalizedArgs = ['exec', ...normalizedArgs]
    }
    if (model && !hasOption(normalizedArgs, ['--model', '-m'])) {
      normalizedArgs = [normalizedArgs[0], '--model', model, ...normalizedArgs.slice(1)]
    }
    if (stdin && !normalizedArgs.includes('-')) normalizedArgs.push('-')
    return { args: normalizedArgs, stdin }
  }

  if (cliName === 'gemini') {
    normalizedArgs = addModelArg(normalizedArgs, normalizeGeminiModel(model))
    normalizedArgs = removeOptionWithValue(normalizedArgs, ['--prompt', '-p'])
    if (!hasAnyArg(normalizedArgs, ['--skip-trust'])) {
      normalizedArgs.push('--skip-trust')
    }
    normalizedArgs.push('--prompt', 'Respond to the prompt provided on stdin.')
    return { args: normalizedArgs, stdin }
  }

  return { args, stdin: '' }
}

function formatArgsForError(args, prompt) {
  return args
    .map((arg) => {
      const value = prompt && arg === prompt ? '<prompt>' : arg
      return /\s/.test(value) ? JSON.stringify(value) : value
    })
    .join(' ')
}

function stripAnsi(value) {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
}

// ─────────────────────────────────────────────
// CLI IPC 핸들러
// execFile로 인수 배열을 직접 전달합니다 (셸/stdin/TTY 불필요).
// 명령 형식: baseCmd --model <model> <prompt>
// ─────────────────────────────────────────────
ipcMain.handle('run-cli', (_event, { template, model, prompt }) => {
  return new Promise((resolve, reject) => {
    try {
      if (!template || !template.trim()) {
        return reject(new Error('CLI command template is not configured.'))
      }

      const tokens = fillCommandTokens(template, model, prompt)
      if (tokens.length === 0) {
        return reject(new Error('CLI command template could not be parsed.'))
      }

      const [cmd, ...args] = tokens
      const normalized = normalizeCliInvocation(cmd, args, model, prompt)
      const env = createCliEnv()
      const prepared = prepareCommand(cmd, normalized.args, env)

      const child = execFile(prepared.command, prepared.args, {
        timeout: CLI_TIMEOUT_MS,
        maxBuffer: CLI_MAX_BUFFER,
        env,
        windowsHide: true,
      }, (err, stdout, stderr) => {
        if (err) {
          const output = stdout && stripAnsi(stdout.trim())
          const errorOutput = stderr && stripAnsi(stderr.trim())
          const message = errorOutput || output || stripAnsi(err.message || '') || 'CLI execution failed.'
          const resolved = prepared.resolvedCommand !== cmd
            ? '\nResolved command: ' + prepared.resolvedCommand
            : ''
          const notFound = err.code === 'ENOENT'
            ? '\nThe CLI executable was not found. Install the CLI or set its full path in the CLI template.'
            : ''

          reject(new Error(
            message +
            '\nCommand: ' + cmd +
            '\nArgs: ' + formatArgsForError(normalized.args, prompt) +
            (normalized.stdin ? '\nInput: stdin' : '') +
            resolved +
            notFound
          ))
        } else {
          resolve(stdout.trim())
        }
      })

      if (child.stdin) {
        child.stdin.on('error', () => {})
        if (normalized.stdin) child.stdin.write(normalized.stdin)
        child.stdin.end()
      }
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    const isLocalApp = url.startsWith(`http://127.0.0.1:${LOCAL_PORT}${STATIC_BASE}/`)
    const isDevApp = process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL)
    if (!isLocalApp && !isDevApp) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  return win
}

async function loadApp(win) {
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    await win.loadURL(devUrl)
    return
  }

  const distDir = path.join(__dirname, '..', 'dist')
  const port = await findFreePort(LOCAL_PORT)
  staticServer = await startStaticServer(distDir, port)
  await win.loadURL(`http://127.0.0.1:${port}${STATIC_BASE}/`)
}

// 지정 포트가 사용 중이면 다음 포트를 순차 탐색
function findFreePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = http.createServer()
    server.listen(startPort, '127.0.0.1', () => {
      server.close(() => resolve(startPort))
    })
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        if (startPort >= LOCAL_PORT + 20) {
          reject(new Error(`포트 ${LOCAL_PORT}~${LOCAL_PORT + 20} 범위에서 사용 가능한 포트를 찾지 못했습니다.`))
        } else {
          findFreePort(startPort + 1).then(resolve).catch(reject)
        }
      } else {
        reject(err)
      }
    })
  })
}

function startStaticServer(distDir, port) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const rawUrl = req.url || '/'
      const url = new URL(rawUrl, 'http://127.0.0.1')
      let pathname = decodeURIComponent(url.pathname)

      if (pathname === '/') {
        res.writeHead(302, { Location: `${STATIC_BASE}/` })
        res.end()
        return
      }
      if (!pathname.startsWith(STATIC_BASE)) {
        res.writeHead(404)
        res.end('Not Found')
        return
      }

      pathname = pathname.slice(STATIC_BASE.length)
      if (pathname === '' || pathname === '/') pathname = '/index.html'
      serveFile(distDir, pathname, res)
    })

    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

function serveFile(distDir, requestPath, res) {
  const safePath = requestPath.replace(/^\/+/, '')
  const filePath = path.resolve(distDir, safePath)
  const normalizedDist = path.resolve(distDir)
  if (!filePath.startsWith(normalizedDist)) {
    res.writeHead(403)
    res.end('Forbidden')
    return
  }

  fs.readFile(filePath, (err, data) => {
    if (!err) {
      res.writeHead(200, { 'Content-Type': getContentType(filePath) })
      res.end(data)
      return
    }

    // SPA fallback (HashRouter라서 보통 필요 없지만 예외 경로에 대비)
    const indexPath = path.join(distDir, 'index.html')
    fs.readFile(indexPath, (indexErr, indexData) => {
      if (indexErr) {
        res.writeHead(404)
        res.end('Not Found')
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(indexData)
    })
  })
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  }
  return map[ext] || 'application/octet-stream'
}

async function boot() {
  const win = createWindow()
  try {
    await loadApp(win)
  } catch (error) {
    const message = error && typeof error === 'object' && 'message' in error ? error.message : String(error)
    await dialog.showMessageBox({
      type: 'error',
      title: '앱 시작 실패',
      message: '앱을 시작하지 못했습니다.',
      detail: message,
    })
    app.quit()
  }
}

app.whenReady().then(boot)

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) boot()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (staticServer) {
    staticServer.close()
    staticServer = null
  }
})
