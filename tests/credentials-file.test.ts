import { mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProgram, KNOWN_COMMANDS } from '../src/cli/program.js';
import { type CliContext, createCliContext } from '../src/cli/shared.js';
import { registerExportCredentialsCommand } from '../src/commands/export-credentials.js';
import { resolveCredentials } from '../src/lib/cookies.js';
import { readCredentialsFile, writeCredentialsFile } from '../src/lib/credentials-file.js';

vi.mock('@steipete/sweet-cookie', () => ({ getCookies: vi.fn() }));

describe('credential files', () => {
  let dir: string;
  const saved = { authToken: 'test-auth', ct0: 'test-csrf' };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'bird-credentials-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
    process.exitCode = 0;
  });

  it('round trips only required secrets with private permissions', async () => {
    const path = join(dir, 'credentials.json');
    await writeCredentialsFile(path, saved);
    expect(await readCredentialsFile(path)).toEqual(saved);
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(saved);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it('does not overwrite files or follow symlinks', async () => {
    const path = join(dir, 'credentials.json');
    await writeCredentialsFile(path, saved);
    await expect(writeCredentialsFile(path, saved)).rejects.toThrow('EEXIST');
    const link = join(dir, 'link');
    await symlink(path, link);
    await expect(writeCredentialsFile(link, saved)).rejects.toThrow('EEXIST');
    expect(await readCredentialsFile(path)).toEqual(saved);
  });

  it.each([
    'null',
    '{}',
    '{"authToken":"auth"}',
    '{"authToken":1,"ct0":"csrf"}',
    '{"authToken":" ","ct0":"csrf"}',
    '{"authToken":"auth;injected=yes","ct0":"csrf"}',
  ])('rejects invalid credentials: %s', async (contents) => {
    const path = join(dir, 'invalid.json');
    await writeFile(path, contents);
    await expect(readCredentialsFile(path)).rejects.toThrow('Expected');
  });

  it('does not leak malformed JSON secrets in errors', async () => {
    const path = join(dir, 'invalid.json');
    await writeFile(path, 'SECRET-not-json');
    await expect(readCredentialsFile(path)).rejects.toThrow('Invalid JSON');
    await expect(readCredentialsFile(path)).rejects.not.toThrow('SECRET');
  });

  it('uses the file exclusively and rebuilds the cookie header', async () => {
    const path = join(dir, 'credentials.json');
    await writeCredentialsFile(path, saved);
    const { cookies } = await resolveCredentials({
      credentialsFile: path,
      authToken: 'ignored-auth',
      ct0: 'ignored-csrf',
    });
    expect(cookies).toEqual({
      ...saved,
      cookieHeader: 'auth_token=test-auth; ct0=test-csrf',
      source: `credentials file ${path}`,
    });
    const { getCookies } = await import('@steipete/sweet-cookie');
    expect(getCookies).not.toHaveBeenCalled();
  });

  it('fails on a missing file even with other credentials supplied', async () => {
    await expect(resolveCredentials({ credentialsFile: join(dir, 'missing'), ...saved })).rejects.toThrow(
      'Cannot read credentials file',
    );
  });

  it('selects files by CLI, environment, then config', async () => {
    const path = join(dir, 'credentials.json');
    await writeCredentialsFile(path, saved);
    const ctx = createCliContext([], { BIRD_CREDENTIALS_FILE: path });
    ctx.config.credentialsFile = join(dir, 'missing-config');
    expect((await ctx.resolveCredentialsFromOptions({})).cookies.authToken).toBe(saved.authToken);
    await expect(ctx.resolveCredentialsFromOptions({ credentialsFile: join(dir, 'missing-cli') })).rejects.toThrow(
      'Cannot read credentials file',
    );
    const configCtx = createCliContext([], {});
    configCtx.config.credentialsFile = path;
    expect((await configCtx.resolveCredentialsFromOptions({})).cookies.ct0).toBe(saved.ct0);
  });

  it('registers the export command and accepts the global file flag after it', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const source = join(dir, 'credentials.json');
    const destination = join(dir, 'export.json');
    await writeCredentialsFile(source, saved);
    expect(KNOWN_COMMANDS.has('export-credentials')).toBe(true);
    await createProgram(createCliContext([], {})).parseAsync([
      'node',
      'bird',
      'export-credentials',
      destination,
      '--credentials-file',
      source,
    ]);
    expect(await readCredentialsFile(destination)).toEqual(saved);
  });

  function programFor(authToken: string | null = saved.authToken): Command {
    const ctx = {
      resolveCredentialsFromOptions: vi.fn(async () => ({
        cookies: { ...saved, authToken, source: 'Safari', cookieHeader: null },
        warnings: [],
      })),
      p: () => '',
    } as unknown as CliContext;
    const program = new Command();
    registerExportCredentialsCommand(program, ctx);
    return program;
  }

  it('exports through the command without printing secrets', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const path = join(dir, 'export.json');
    await programFor().parseAsync(['node', 'bird', 'export-credentials', path]);
    expect(await readCredentialsFile(path)).toEqual(saved);
    expect(log.mock.calls.flat().join(' ')).not.toContain(saved.authToken);
    expect(log.mock.calls.flat().join(' ')).not.toContain(saved.ct0);
  });

  it('does not create an export when credentials are missing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const path = join(dir, 'export.json');
    await programFor(null).parseAsync(['node', 'bird', 'export-credentials', path]);
    expect(process.exitCode).toBe(1);
    await expect(stat(path)).rejects.toThrow('ENOENT');
  });
});
