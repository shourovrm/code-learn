// The models an agent's own settings approve (DESIGN §3.3): pi's enabled models and codex's config files. Claude Code
// and Cursor have no such file, so they keep the list in shared/models.json. Only the model settings are read.
import { readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AgentId } from '../../shared/api';

/**
 * The ids an agent's settings approve, in the file's order and without repeats. Empty when there is no such file, or it
 * yields none: the caller then offers the models.json list.
 */
export function approvedIds(agent: AgentId, home: string = homedir()): string[] {
  const ids = agent === 'pi' ? piIds(home) : agent === 'codex' ? codexIds(home) : [];
  return [...new Set(ids)];
}

/** A file's text, or null when it is missing or can't be read: a settings file that isn't there is normal. */
function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** A folder's entry names, or none when it is missing. */
function listNames(folder: string): string[] {
  try {
    return readdirSync(folder);
  } catch {
    return [];
  }
}

/** The settings object in a JSON text; an empty one when the text is malformed, so that the caller falls back. */
function settingsOf(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** pi's `enabledModels` as written, then its `defaultModel`, prefixed with `defaultProvider` when it names no provider. */
function piIds(home: string): string[] {
  const text = readText(join(home, '.pi', 'agent', 'settings.json'));
  if (text === null) return [];
  const settings = settingsOf(text);
  const enabled = Array.isArray(settings.enabledModels)
    ? settings.enabledModels.filter((id): id is string => typeof id === 'string' && id !== '')
    : [];
  const model = typeof settings.defaultModel === 'string' ? settings.defaultModel : '';
  const provider = typeof settings.defaultProvider === 'string' ? settings.defaultProvider : '';
  if (model === '') return enabled;
  // A model id with a `/` already names its provider, as pi writes `openrouter/...` ids.
  const qualified = model.includes('/') || provider === '' ? model : `${provider}/${model}`;
  return [...enabled, qualified];
}

/** Codex's top-level `model` in config.toml, then in each *.config.toml beside it, by file name. */
function codexIds(home: string): string[] {
  const folder = join(home, '.codex');
  const profiles = listNames(folder).filter((name) => name.endsWith('.config.toml')).sort();
  const ids: string[] = [];
  for (const name of ['config.toml', ...profiles]) {
    const text = readText(join(folder, name));
    const model = text === null ? null : topLevelModel(text);
    if (model) ids.push(model);
  }
  return ids;
}

/** The `model` key before the first table header, which is where TOML's top-level keys are. Other keys are never read. */
function topLevelModel(toml: string): string | null {
  for (const line of toml.split('\n')) {
    if (line.trim().startsWith('[')) return null;
    const match = /^\s*model\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(line);
    if (match) return match[1] ?? match[2];
  }
  return null;
}
