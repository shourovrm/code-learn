// pi: launching a headless turn with code-learn's MCP server, and reading its JSON event stream (DESIGN §3.1). pi's
// stream is one session header, then session events (pi docs/json.md); its tool events carry the call id and result.
import type { AgentCli, AgentEvent } from './agents';
import { count, json, obj, PLAN_LIMIT, plain, progress, stepOf, str, TEXT_MAX, textOf, versionRead } from './stream';

/**
 * pi names an MCP tool `mcp__<server>__<tool>` with every character but letters, digits and `_` turned into `_`, so
 * the code-learn server's tools start with this.
 */
const TOOL_PREFIX = 'mcp__code_learn__';

/** The model code-learn suggests for pi: Claude Haiku 5.5 through OpenRouter (shared/models.json). */
export const PI_RECOMMENDED = 'openrouter/anthropic/claude-haiku-5.5';

/** A code-learn tool by the name the rest of the app uses (`code-learn.<tool>`); any other tool keeps pi's name. */
const toolName = (name: string) => (name.startsWith(TOOL_PREFIX) ? `code-learn.${name.slice(TOOL_PREFIX.length)}` : name);

/** The run's usage, summed over its assistant messages (pi reports usage per message). */
function usageOfRun(messages: unknown): AgentEvent[] {
  if (!Array.isArray(messages)) return [];
  const used = { input: 0, output: 0, cachedInput: 0, costUsd: 0 };
  for (const message of messages) {
    const usage = obj(obj(message)?.usage);
    if (obj(message)?.role !== 'assistant' || !usage) continue;
    const read = count(usage.cacheRead);
    used.input += count(usage.input) + read + count(usage.cacheWrite);
    used.cachedInput += read;
    used.output += count(usage.output);
    used.costUsd += count(obj(usage.cost)?.total);
  }
  return [{ type: 'usage', ...used }];
}

/** How the run's last assistant message ended: pi records a failed or aborted reply as a stop reason, not an exit code. */
function doneOf(messages: unknown): AgentEvent {
  const replies = Array.isArray(messages) ? messages.map(obj).filter((m) => m?.role === 'assistant') : [];
  const last = replies.at(-1);
  if (last?.stopReason === 'error' || last?.stopReason === 'aborted') {
    const why = str(last.errorMessage) ? last.errorMessage.slice(0, TEXT_MAX) : String(last.stopReason);
    return { type: 'done', ok: false, error: why };
  }
  return { type: 'done', ok: true };
}

export const pi: AgentCli = {
  bin: 'pi',
  launch({ prompt, server, tools, model, resume }) {
    // Only code-learn's tools: no built-in read, bash, edit or write, and no extension but pi's own MCP support, so the
    // learner's other pi servers and extensions never load. --approve trusts the job folder, which is code-learn's own
    // and holds only .pi/mcp.json; without it print mode skips that file. pi has no web tools of its own, so research
    // and setup run on the model's knowledge (§3.1).
    const args = ['-p', '--mode', 'json', '--approve', '--no-builtin-tools'];
    args.push(...(tools.length ? ['--tools', tools.map((t) => `${TOOL_PREFIX}${t}`).join(',')] : ['--no-tools']));
    args.push('--no-extensions', '-e', 'builtin:mcp', '--no-skills', '--no-prompt-templates', '--no-context-files', '--no-themes');
    // Sessions stay in the job folder, which the same job config reuses, so a tutor turn resumes.
    args.push('--session-dir', '.pi/sessions');
    if (model) args.push('--model', model);
    if (resume) args.push('--session', resume);
    args.push('--', prompt);
    // `direct`: the tools are declared to the model, and the first prompt waits for the server to connect (pi docs/mcp.md).
    return { args, files: { '.pi/mcp.json': JSON.stringify({ mcpServers: { 'code-learn': { ...server, exposure: 'direct' } } }) } };
  },
  parse(line) {
    const e = json(line);
    if (!e) return [];
    if (e.type === 'session') return str(e.id) ? [{ type: 'session', id: e.id }] : [];
    if (e.type === 'tool_execution_start') {
      if (!str(e.toolCallId) || !str(e.toolName)) return [];
      const name = toolName(e.toolName);
      return [{ type: 'tool_call', id: e.toolCallId, name }, ...(name.startsWith('code-learn.') ? progress(stepOf(name.slice('code-learn.'.length))) : [])];
    }
    if (e.type === 'tool_execution_end') {
      if (!str(e.toolCallId)) return [];
      const error = e.isError === true;
      const text = error ? textOf(obj(e.result)?.content) : '';
      return [{ type: 'tool_result', id: e.toolCallId, error, ...(text ? { text } : {}) }];
    }
    if (e.type === 'message_end') {
      const message = obj(e.message);
      if (message?.role !== 'assistant' || !Array.isArray(message.content)) return [];
      const text = textOf(message.content.filter((c) => obj(c)?.type === 'text'));
      return text ? [{ type: 'text', text }] : [];
    }
    // agent_end closes a run; pi may still retry it (willRetry), and then a later agent_end reports.
    if (e.type === 'agent_end' && e.willRetry !== true) return [...usageOfRun(e.messages), doneOf(e.messages)];
    return [];
  },
  // stderr is drained, never shown; only these fixed failures are read from it, as for Cursor.
  errors: (line) =>
    PLAN_LIMIT.test(plain(line))
      ? [{ type: 'done', ok: false, error: 'usage limit' }]
      : /connection lost|ENOTFOUND|EAI_AGAIN|network is unreachable|fetch failed/i.test(line)
        ? [{ type: 'done', ok: false, error: 'connection error' }]
        : [],
  version: { args: ['--version'], read: versionRead(/^(\d+\.\d+\.\d+\S*)/m) },
  // pi signs in per provider, and the provider depends on the model, so its answer can't say signed in or not.
  signIn: { args: ['--version'], read: () => null },
};
