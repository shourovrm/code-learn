// The code-learn MCP server an agent job starts (DESIGN §2, §4.6): the bundled core,
// run by the app itself as Node, bound to one course and the job's tools.
import { join } from 'node:path';
import type { McpServer } from './agent/agents';

export interface ServerPlaces {
  /** The app's own executable. */
  runtime: string;
  /** out/core in development, <resources>/core when packaged. */
  coreDir: string;
  ws: string;
  env: NodeJS.ProcessEnv;
}

export function codeLearnServer({ runtime, coreDir, ws, env }: ServerPlaces) {
  /** `progress`: a file where save_exercise writes which gate runs, for the job's progress (§4.11). */
  return (course: string | undefined, tools: string[], progress?: string): McpServer => ({
    command: runtime,
    args: [
      join(coreDir, 'dist', 'cli.mjs'), 'mcp', '--workspace', ws, ...(course ? ['--course', course] : []), '--tools', tools.join(','), '--desktop',
      ...(progress ? ['--progress', progress] : []),
    ],
    // Codex starts MCP servers without the app's environment, so the server is told where code-learn's data is,
    // the PATH the app was started with, and the micromamba the app bundles (core §4.6).
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      ...(env.CODE_LEARN_HOME ? { CODE_LEARN_HOME: env.CODE_LEARN_HOME } : {}),
      ...(env.PATH ? { PATH: env.PATH } : {}),
      ...(env.CODE_LEARN_MICROMAMBA ? { CODE_LEARN_MICROMAMBA: env.CODE_LEARN_MICROMAMBA } : {}),
    },
  });
}
