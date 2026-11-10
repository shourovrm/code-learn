import { useEffect, useState } from 'react';
import type { Agent } from '../../../shared/api';
import { useApi } from '../../app/api';
import { useRouter, type Route } from '../../app/router';
import { Failed } from '../../app/Problems';
import { useLoad } from '../../app/useLoad';
import { Button } from '../../ui/Button';
import { ModelRows } from './ModelRows';

/** The step after Connect: a model for each kind of job, from the connected agent's enabled models. */
export function Models({ then }: { then: Route }) {
  const api = useApi();
  const { go } = useRouter();
  const { data, error, reload } = useLoad(() => api.agents(), []);
  const [chosen, setChosen] = useState<Agent>();
  const agent = chosen ?? data?.find((a) => a.state === 'connected');
  const next: Route = { to: 'computer', then, fromConnect: true };
  // Nothing to choose with no agent connected: Connect is the step to redo.
  useEffect(() => {
    if (data && !agent) go({ to: 'connect', then });
  }, [data, agent]);
  if (error) return <Failed error={error} retry={reload} />;
  if (!agent) return null;
  return (
    <main className="center">
      <div className="stack setup-col">
        <h1 className="h1 a-up" tabIndex={-1}>Choose a model for each job</h1>
        <p className="sub">{agent.name} offers these models. Each job starts on the recommended one.</p>
        <div className="card models-card a-up">
          <ModelRows agent={agent} onChange={setChosen} />
        </div>
        <div className="a-up connect-foot">
          <span className="quiet-text">You can change these later in Settings.</span>
          <span className="actions">
            <Button variant="ghost" size="lg" onClick={() => go({ to: 'connect', then })}>Back</Button>
            <Button size="lg" onClick={() => go(next)}>Continue</Button>
          </span>
        </div>
      </div>
    </main>
  );
}
