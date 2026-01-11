import { appendFileSync, mkdirSync } from 'node:fs';
import { EOL } from 'node:os';
import { dirname, resolve } from 'node:path';
import { getCliVersion } from './version.js';

type DebugError = {
  name?: string;
  message?: string;
  stack?: string;
  code?: string;
};

type DebugEntry = {
  timestamp: string;
  event: string;
  argv: string[];
  node: string;
  version: string;
  platform: string;
  data?: Record<string, unknown>;
  error?: DebugError;
};

const DEFAULT_DEBUG_PATH = 'debug.json';

function getDebugPath(): string {
  const customPath = process.env.BIRD_DEBUG_PATH;
  return resolve(process.cwd(), customPath && customPath.trim() !== '' ? customPath : DEFAULT_DEBUG_PATH);
}

function ensureDir(path: string): void {
  try {
    mkdirSync(dirname(path), { recursive: true });
  } catch {
    // ignore; appendFileSync will throw if this truly fails
  }
}

function formatError(error: unknown): DebugError | undefined {
  if (!error) {
    return undefined;
  }
  if (error instanceof Error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: typeof code === 'string' ? code : undefined,
    };
  }
  return { message: typeof error === 'string' ? error : JSON.stringify(error) };
}

function writeDebugEntry(entry: DebugEntry): string | undefined {
  const path = getDebugPath();
  try {
    ensureDir(path);
    appendFileSync(path, `${JSON.stringify(entry, null, 2)}${EOL}`);
    return path;
  } catch {
    return undefined;
  }
}

export function logDebugEvent(event: string, data?: Record<string, unknown>, error?: unknown): string | undefined {
  const entry: DebugEntry = {
    timestamp: new Date().toISOString(),
    event,
    argv: process.argv.slice(2),
    node: process.version,
    version: getCliVersion(),
    platform: `${process.platform}-${process.arch}`,
    data,
    error: formatError(error),
  };

  return writeDebugEntry(entry);
}

export function installDebugLogger(): void {
  const notify = (origin: string, error: unknown) => {
    const path = logDebugEvent(origin, undefined, error);
    if (path) {
      console.error(`[bird] Unexpected ${origin}. Saved debug info to ${path}.`);
    } else {
      console.error(`[bird] Unexpected ${origin}. Failed to write debug log.`);
    }
  };

  process.on('uncaughtException', (error) => {
    notify('uncaughtException', error);
  });

  process.on('unhandledRejection', (reason) => {
    notify('unhandledRejection', reason);
  });
}
