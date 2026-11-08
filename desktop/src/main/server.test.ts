// @vitest-environment node
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { codeLearnServer } from './server';

describe("the code-learn server an agent job starts (§2, §4.6)", () => {
  it('is the bundled core run by the app as Node, bound to the course and the job tools', () => {
    expect(codeLearnServer({ runtime: '/App/code-learn', coreDir: '/App/core', ws: '/ws', env: {} })('c1', ['get_roadmap', 'save_lesson'])).toEqual({
      command: '/App/code-learn',
      args: [join('/App/core', 'dist', 'cli.mjs'), 'mcp', '--workspace', '/ws', '--course', 'c1', '--tools', 'get_roadmap,save_lesson', '--desktop'],
      env: { ELECTRON_RUN_AS_NODE: '1' },
    });
  });

  it("names code-learn's data folder itself: Codex starts MCP servers without the app's environment", () => {
    // Found in the macOS journey: a Codex job's server wrote the course to the default ~/.code-learn.
    expect(codeLearnServer({ runtime: '/App/code-learn', coreDir: '/App/core', ws: '/ws', env: {} })('c1', ['save_exercise'], '/data/progress/j.json').args.slice(-2)).toEqual(['--progress', '/data/progress/j.json']);
    const server = codeLearnServer({ runtime: '/App/code-learn', coreDir: '/App/core', ws: '/ws', env: { CODE_LEARN_HOME: '/data/code-learn', PATH: '/usr/bin:/home/me/.local/bin' } })(undefined, ['list_tracks']);
    // PATH too: the app was started with a PATH the server's tools need.
    expect(server.env).toEqual({ ELECTRON_RUN_AS_NODE: '1', CODE_LEARN_HOME: '/data/code-learn', PATH: '/usr/bin:/home/me/.local/bin' });
    expect(server.args).not.toContain('--course');
  });

  it("passes on the app's bundled micromamba, so the agent's server installs track toolchains with it (core §4.6)", () => {
    const server = codeLearnServer({ runtime: '/App/code-learn', coreDir: '/App/core', ws: '/ws', env: { CODE_LEARN_MICROMAMBA: '/App/micromamba/micromamba', SECRET_TOKEN: 'x' } })('c1', ['save_track']);
    expect(server.env).toEqual({ ELECTRON_RUN_AS_NODE: '1', CODE_LEARN_MICROMAMBA: '/App/micromamba/micromamba' });
  });
});
