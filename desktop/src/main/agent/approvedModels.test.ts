// @vitest-environment node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../testing/temp';
import { approvedIds } from './approvedModels';

/** Writes a file under the fake home folder, making its folders first. */
function write(home: string, path: string, text: string) {
  mkdirSync(join(home, dirname(path)), { recursive: true });
  writeFileSync(join(home, path), text);
}

describe("approvedIds: the models an agent's own settings approve (DESIGN §3.3)", () => {
  it("reads pi's enabled models in order, then the default model, without repeats", () => {
    const home = tempDir();
    write(home, '.pi/agent/settings.json', JSON.stringify({
      enabledModels: ['openrouter/anthropic/claude-haiku-5.5', 'minimax/MiniMax-M3'],
      defaultProvider: 'openai',
      defaultModel: 'gpt-6-luna',
    }));
    expect(approvedIds('pi', home)).toEqual(['openrouter/anthropic/claude-haiku-5.5', 'minimax/MiniMax-M3', 'openai/gpt-6-luna']);
  });

  it('keeps a default model that already names its provider as written, and drops the repeat', () => {
    const home = tempDir();
    write(home, '.pi/agent/settings.json', JSON.stringify({
      enabledModels: ['openai/gpt-6-luna'],
      defaultProvider: 'openrouter',
      defaultModel: 'openai/gpt-6-luna',
    }));
    expect(approvedIds('pi', home)).toEqual(['openai/gpt-6-luna']);
  });

  it('keeps a default model with no provider as written when no provider is set', () => {
    const home = tempDir();
    write(home, '.pi/agent/settings.json', JSON.stringify({ enabledModels: ['a/b'], defaultModel: 'solo' }));
    expect(approvedIds('pi', home)).toEqual(['a/b', 'solo']);
  });

  it('reads the top-level model of config.toml and of each *.config.toml, in name order, without repeats', () => {
    const home = tempDir();
    write(home, '.codex/config.toml', 'model = "gpt-6-luna"\n\n[profiles.fast]\nmodel = "not-top-level"\n');
    write(home, '.codex/b.config.toml', "model = 'gpt-6-luna'\n");
    write(home, '.codex/a.config.toml', 'model = "gpt-5.6-luna" # the older one\n');
    write(home, '.codex/other.toml', 'model = "ignored"\n');
    expect(approvedIds('codex', home)).toEqual(['gpt-6-luna', 'gpt-5.6-luna']);
  });

  it('is empty for a missing or malformed file, so the caller falls back', () => {
    const home = tempDir();
    expect(approvedIds('pi', home)).toEqual([]);
    expect(approvedIds('codex', home)).toEqual([]);
    write(home, '.pi/agent/settings.json', '{ "enabledModels": [');
    expect(approvedIds('pi', home)).toEqual([]);
  });

  it('is empty for claude and cursor, which have no approved-list file', () => {
    const home = tempDir();
    write(home, '.pi/agent/settings.json', JSON.stringify({ enabledModels: ['a/b'] }));
    expect(approvedIds('claude', home)).toEqual([]);
    expect(approvedIds('cursor', home)).toEqual([]);
  });
});
