import * as fs from "fs"
import * as os from "os"
import * as path from "path"

const LOG_FILENAME = "extendai-lab.log"
const DEFAULT_MAX_LOG_FILE_SIZE_BYTES = 50 * 1024 * 1024
const DEFAULT_MAX_LOG_FILE_BACKUPS = 2

let logFile = path.join(os.tmpdir(), LOG_FILENAME)
let maxLogFileSizeBytes = DEFAULT_MAX_LOG_FILE_SIZE_BYTES
let maxLogFileBackups = DEFAULT_MAX_LOG_FILE_BACKUPS

let buffer: string[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
const FLUSH_INTERVAL_MS = 500
const BUFFER_SIZE_LIMIT = 50

function rotateLogFileIfNeeded(): void {
  try {
    if (!fs.existsSync(logFile)) return
    const stats = fs.statSync(logFile)
    if (stats.size <= maxLogFileSizeBytes) return

    const oldest = `${logFile}.${maxLogFileBackups}`
    if (fs.existsSync(oldest)) {
      fs.unlinkSync(oldest)
    }
    for (let i = maxLogFileBackups - 1; i >= 1; i -= 1) {
      const src = `${logFile}.${i}`
      const dst = `${logFile}.${i + 1}`
      if (fs.existsSync(src)) {
        fs.renameSync(src, dst)
      }
    }
    fs.renameSync(logFile, `${logFile}.1`)
  } catch {
  }
}

function flush(): void {
  if (buffer.length === 0) return
  const data = buffer.join("")
  buffer = []
  try {
    fs.appendFileSync(logFile, data)
    rotateLogFileIfNeeded()
  } catch {
  }
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    flush()
  }, FLUSH_INTERVAL_MS)
}

export function log(message: string, data?: unknown): void {
  try {
    const timestamp = new Date().toISOString()
    const logEntry = `[${timestamp}] ${message} ${data ? JSON.stringify(data) : ""}\n`
    buffer.push(logEntry)
    if (buffer.length >= BUFFER_SIZE_LIMIT) {
      flush()
    } else {
      scheduleFlush()
    }
  } catch {
  }
}

export function getLogFilePath(): string {
  return logFile
}
