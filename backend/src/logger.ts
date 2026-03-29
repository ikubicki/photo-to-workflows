import { writeFileSync, appendFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOG_PATH = resolve(__dirname, '../../logs/agent.log')

export function clearLog() {
  writeFileSync(LOG_PATH, '', 'utf-8')
}

export function log(...args: unknown[]) {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] ${args.map(a => typeof a === 'string' ? a : JSON.stringify(a, null, 2)).join(' ')}\n`
  process.stdout.write(line)
  appendFileSync(LOG_PATH, line, 'utf-8')
}
