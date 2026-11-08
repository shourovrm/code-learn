import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AgentEvent } from './agents';
import { PI_RECOMMENDED, pi } from './pi';

const server = { command: '/app/code-learn', args: ['/app/core/cli.mjs', 'mcp', '--workspace', '/ws'], env: { CODE_LEARN_HOME: '/home/me/.code-learn' } };
const parseAll = (lines: string[]) => lines.flatMap((line) => pi.parse!(line));
const line = (event: unknown) => JSON.stringify(event);

describe('pi: launching a turn', () => {
  const { args, files } = pi.launch!({ prompt: 'Teach me', server, tools: ['list_tracks', 'save_track'], model: PI_RECOMMENDED });

  it("allows only the job's code-learn tools: no built-in tools, extensions, skills or context files", () => {
    expect(args.slice(0, 5)).toEqual(['-p', '--mode', 'json', '--approve', '--no-builtin-tools']);
    expect(args[args.indexOf('--tools') + 1]).toBe('mcp__code_learn__list_tracks,mcp__code_learn__save_track');
    for (const flag of ['--no-extensions', '--no-skills', '--no-prompt-templates', '--no-context-files', '--no-themes']) expect(args).toContain(flag);
    // pi's MCP support is a built-in extension: the only one loaded.
    expect(args[args.indexOf('-e') + 1]).toBe('builtin:mcp');
  });

  it('runs the chosen model, keeps sessions in the job folder, and passes the prompt after --', () => {
    expect(args[args.indexOf('--model') + 1]).toBe('openrouter/anthropic/claude-haiku-5.5');
    expect(args[args.indexOf('--session-dir') + 1]).toBe('.pi/sessions');
    expect(args.slice(-2)).toEqual(['--', 'Teach me']);
  });

  it("writes only code-learn's server to the job folder's .pi/mcp.json, with its tools declared directly", () => {
    expect(Object.keys(files!)).toEqual(['.pi/mcp.json']);
    expect(JSON.parse(files!['.pi/mcp.json']!)).toEqual({ mcpServers: { 'code-learn': { ...server, exposure: 'direct' } } });
  });

  it('resumes a session by its id, and turns every tool off for a job with none', () => {
    const resumed = pi.launch!({ prompt: 'Next', server, tools: ['progress'], resume: 'abc-123' }).args;
    expect(resumed[resumed.indexOf('--session') + 1]).toBe('abc-123');
    expect(resumed).not.toContain('--model');
    const none = pi.launch!({ prompt: 'x', server, tools: [] }).args;
    expect(none).toContain('--no-tools');
    expect(none).not.toContain('--tools');
  });
});

describe('pi: reading its JSON stream (recorded fixture)', () => {
  // A real run of pi 1.4.0 with Claude Haiku 5.5 through OpenRouter, calling code-learn's list_tracks once.
  const recorded = readFileSync(join(import.meta.dirname, 'fixtures', 'pi-list-tracks.jsonl'), 'utf8').trim().split('\n');
  const events = parseAll(recorded);

  it('becomes session, code-learn tool call and step, result, text, usage and done events', () => {
    expect(events.map((e) => e.type)).toEqual(['session', 'tool_call', 'progress', 'tool_result', 'text', 'usage', 'done']);
    expect(events[0]).toEqual({ type: 'session', id: JSON.parse(recorded[0]!).id });
    expect(events[1]).toEqual({ type: 'tool_call', id: 'toolu_01M2R85PYkBwVa8qxnu31iVL', name: 'code-learn.list_tracks' });
    expect(events[2]).toEqual({ type: 'progress', step: { kind: 'step', label: 'Checking the installed tracks' } });
    expect(events[3]).toEqual({ type: 'tool_result', id: 'toolu_01M2R85PYkBwVa8qxnu31iVL', error: false });
    expect(events[4]).toEqual({ type: 'text', text: 'done' });
    expect(events.at(-1)).toEqual({ type: 'done', ok: true });
  });

  it('sums the usage of every assistant message in the run', () => {
    const usage = events.find((e): e is AgentEvent & { type: 'usage' } => e.type === 'usage')!;
    expect(usage.input).toBeGreaterThan(0);
    expect(usage.output).toBeGreaterThan(0);
    expect(usage.costUsd).toBeGreaterThan(0);
  });

  it('never turns thinking into text', () => {
    expect(events.filter((e) => e.type === 'text')).toEqual([{ type: 'text', text: 'done' }]);
  });
});

describe('pi: failures', () => {
  it('reports a failed tool call with a little of its text', () => {
    const failed = line({ type: 'tool_execution_end', toolCallId: 'c1', toolName: 'mcp__code_learn__save_track', isError: true, result: { content: [{ type: 'text', text: 'code-learn:offline\nNo network' }] } });
    expect(parseAll([failed])).toEqual([{ type: 'tool_result', id: 'c1', error: true, text: 'code-learn:offline\nNo network' }]);
  });

  it("reports a reply that ended in an error as a failed run, with pi's reason", () => {
    const end = line({ type: 'agent_end', willRetry: false, messages: [{ role: 'assistant', stopReason: 'error', errorMessage: '429 Too Many Requests', content: [] }] });
    expect(parseAll([end]).at(-1)).toEqual({ type: 'done', ok: false, error: '429 Too Many Requests' });
  });

  it('waits for the last attempt when pi will retry', () => {
    expect(parseAll([line({ type: 'agent_end', willRetry: true, messages: [] })])).toEqual([]);
  });

  it("names another tool by pi's own name, with no code-learn step", () => {
    expect(parseAll([line({ type: 'tool_execution_start', toolCallId: 'c2', toolName: 'read', args: {} })])).toEqual([{ type: 'tool_call', id: 'c2', name: 'read' }]);
  });

  it('reads a usage limit and a lost connection from stderr, and nothing else there', () => {
    expect(pi.errors!('Error: 429 rate limit exceeded')).toEqual([{ type: 'done', ok: false, error: 'usage limit' }]);
    expect(pi.errors!('TypeError: fetch failed')).toEqual([{ type: 'done', ok: false, error: 'connection error' }]);
    expect(pi.errors!('Warning: No models match pattern "x"')).toEqual([]);
  });

  it("can't tell signed in from signed out, since pi signs in per provider", () => {
    expect(pi.signIn.read({ code: 0, output: '1.4.0' })).toBeNull();
    expect(pi.version.read({ code: 0, output: '1.4.0\n' })).toBe('1.4.0');
  });
});
