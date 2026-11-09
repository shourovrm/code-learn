// The models a learner may choose per agent (O6). An agent's approved ids (main/agent/approvedModels.ts) are its list when
// it has any; otherwise the bench-tested ones in models.json (docs/bench/results.md). The recommended one is marked and
// chosen by default.
import type { AgentId, ModelChoice } from './api';
import table from './models.json';

export function modelChoices(agent: AgentId, approved: string[] = []): ModelChoice[] {
  const t = table[agent];
  if (!t) return [];
  const ids = approved.length > 0 ? approved : t.models.map((m) => m.id);
  const recommended = ids.includes(t.recommended) ? t.recommended : ids[0];
  return ids.map((id) => ({
    id,
    label: t.models.find((m) => m.id === id)?.label ?? id,
    recommended: id === recommended,
  }));
}

/** The saved choice while it is still on the list, otherwise the recommended model; null for an agent with no choices. */
export function modelFor(choices: ModelChoice[], saved?: string): string | null {
  return (choices.find((m) => m.id === saved) ?? choices.find((m) => m.recommended))?.id ?? null;
}
