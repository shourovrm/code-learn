// The models a learner may choose per agent and kind of job (O6). The ids an agent's own settings enable
// (main/agent/approvedModels.ts) are its list when it has any; otherwise the ones in models.json. The recommended one is
// marked and chosen by default.
import type { AgentId, ModelChoice, ModelJob } from './api';
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

/** Every kind of job a model is chosen for, in the order the screens list them. */
export const MODEL_JOBS: ModelJob[] = ['planning', 'lessons', 'exercises', 'tutor'];

/**
 * The model of each kind of job: its saved choice while that is still on the list, otherwise `before`, the one model
 * the agent had when a single choice covered every job, otherwise the recommended one.
 */
export function jobModels(choices: ModelChoice[], saved: Partial<Record<ModelJob, string>> = {}, before?: string): Record<ModelJob, string | null> {
  const fallback = modelFor(choices, before);
  const models = {} as Record<ModelJob, string | null>;
  for (const job of MODEL_JOBS) models[job] = choices.some((m) => m.id === saved[job]) ? saved[job]! : fallback;
  return models;
}

/** The saved choice while it is still on the list, otherwise the recommended model; null for an agent with no choices. */
export function modelFor(choices: ModelChoice[], saved?: string): string | null {
  return (choices.find((m) => m.id === saved) ?? choices.find((m) => m.recommended))?.id ?? null;
}
