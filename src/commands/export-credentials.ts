import type { Command } from 'commander';
import type { CliContext } from '../cli/shared.js';
import { writeCredentialsFile } from '../lib/credentials-file.js';

export function registerExportCredentialsCommand(program: Command, ctx: CliContext): void {
  program
    .command('export-credentials')
    .description('Export session credentials to a new private JSON file')
    .argument('<path>', 'Destination file (must not exist; parent directory must exist)')
    .action(async (path: string) => {
      try {
        const { cookies, warnings } = await ctx.resolveCredentialsFromOptions(program.opts());
        for (const warning of warnings) {
          console.error(`${ctx.p('warn')}${warning}`);
        }
        if (!cookies.authToken || !cookies.ct0) {
          throw new Error('Missing required credentials. Log into x.com in Safari, Chrome, or Firefox first.');
        }
        await writeCredentialsFile(path, { authToken: cookies.authToken, ct0: cookies.ct0 });
        console.log(`${ctx.p('ok')}Credentials exported to ${path}. Keep this file private; it grants account access.`);
      } catch (error) {
        console.error(`${ctx.p('err')}${error instanceof Error ? error.message : 'Credential export failed'}`);
        process.exitCode = 1;
      }
    });
}
