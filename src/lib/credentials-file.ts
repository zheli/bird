import { readFile, writeFile } from 'node:fs/promises';

const INVALID_COOKIE_VALUE = /[^\x21-\x3a\x3c-\x7e]/;

export interface SavedCredentials {
  authToken: string;
  ct0: string;
}

function validateCredentials(value: unknown): SavedCredentials {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Expected an object with authToken and ct0 strings');
  }
  const record = value as Record<string, unknown>;
  for (const key of ['authToken', 'ct0']) {
    const token = record[key];
    if (typeof token !== 'string' || !token.trim() || INVALID_COOKIE_VALUE.test(token)) {
      throw new Error('Expected non-empty authToken and ct0 cookie values without whitespace or delimiters');
    }
  }
  return { authToken: record.authToken as string, ct0: record.ct0 as string };
}

export async function readCredentialsFile(path: string): Promise<SavedCredentials> {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch {
    throw new Error(`Cannot read credentials file "${path}"`);
  }
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    // JSON parse errors can include credential values; never forward them.
    throw new Error(`Invalid JSON in credentials file "${path}"`);
  }
  return validateCredentials(value);
}

export async function writeCredentialsFile(path: string, credentials: SavedCredentials): Promise<void> {
  const saved = validateCredentials(credentials);
  // Exclusive creation avoids overwriting existing files or following symlinks.
  await writeFile(path, `${JSON.stringify(saved, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
}
