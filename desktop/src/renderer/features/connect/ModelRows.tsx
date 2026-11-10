import type { Agent, ModelJob } from '../../../shared/api';
import { MODEL_JOBS } from '../../../shared/models';
import { useApi } from '../../app/api';
import { useRouter } from '../../app/router';

/** What each kind of job is, so the learner can weigh a model's cost against the work. */
const JOBS: Record<ModelJob, { name: string; text: string }> = {
  planning: { name: 'Planning', text: 'The roadmap, its review and the toolchain setup. A few runs for each course.' },
  lessons: { name: 'Lessons', text: 'One run writes three lessons. This is most of a course’s cost, and a small model does it well.' },
  exercises: { name: 'Exercises', text: 'Each exercise with its hidden tests. The hardest job.' },
  tutor: { name: 'Tutor', text: 'Hints and chat beside an exercise. Short answers, asked often.' },
};

/**
 * A model menu for each kind of job, listing the models the agent has enabled. A choice is saved at once, and
 * `onChange` gets the agent as it is afterwards.
 */
export function ModelRows({ agent, onChange }: { agent: Agent; onChange: (agent: Agent) => void }) {
  const api = useApi();
  const { fail } = useRouter();

  async function choose(job: ModelJob, model: string) {
    try {
      onChange(await api.chooseModel(agent.id, job, model));
    } catch (e) {
      fail(e);
    }
  }

  return (
    <div className="model-rows">
      {MODEL_JOBS.map((job) => (
        <div key={job} className="model-row">
          <label htmlFor={`model-${job}`}>
            <b>{JOBS[job].name}</b>
            <span className="quiet-text">{JOBS[job].text}</span>
          </label>
          <select id={`model-${job}`} className="field" value={agent.jobModels[job] ?? ''} onChange={(e) => choose(job, e.target.value)}>
            {agent.models.map((m) => <option key={m.id} value={m.id}>{m.recommended ? `${m.label} (recommended)` : m.label}</option>)}
          </select>
        </div>
      ))}
    </div>
  );
}
