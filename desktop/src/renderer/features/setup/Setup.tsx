import { useEffect, useState } from 'react';
import type { Agent, AgentId } from '../../../shared/api';
import { useApi } from '../../app/api';
import { useRouter } from '../../app/router';
import { Failed, Stale } from '../../app/Problems';
import { timing, useLoad } from '../../app/useLoad';
import { Button } from '../../ui/Button';
import { Status } from '../../ui/Icon';
import { stagger } from '../../ui/motion';
import { InstallProgress, running } from '../connect/Connect';
import { ExternalLink } from '../../ui/ExternalLink';

/** Each agent's maker and terms, for the learner's go-ahead. */
const TERMS: Partial<Record<AgentId, { vendor: string; url: string }>> = {
  claude: { vendor: 'Anthropic', url: 'https://www.anthropic.com/legal/consumer-terms' },
  codex: { vendor: 'OpenAI', url: 'https://openai.com/policies/' },
  cursor: { vendor: 'Cursor', url: 'https://cursor.com/terms-of-service' },
};

/** An agent can be installed here when none is installed and code-learn knows how to install one. */
export function agentMissing(agents: Agent[]) {
  return agents.every((a) => a.state === 'missing') && agents.some((a) => a.canInstall);
}

/**
 * One action installs the agent the learner chose, the maker's own way. Nothing downloads before the learner says so.
 */
export function Setup() {
  const api = useApi();
  const { go, fail } = useRouter();
  const [wanted, setWanted] = useState<AgentId>();
  const [choice, setChoice] = useState<AgentId>('claude');
  // Until an agent is connected, look again every few seconds, so one installed elsewhere drops off the list. Once
  // started, follow the install. Coming back from a sign-in looks again too.
  const { data, error, stale, reload } = useLoad(() => api.agents(), [wanted], {
    settled: (agents) => !wanted && agents.some((a) => a.state === 'connected'),
    every: wanted ? timing.pollMs : timing.agentsMs,
    onFocus: true,
  });
  const agent = wanted ? data?.find((a) => a.id === wanted) : undefined;
  const ready = agent?.state === 'connected';
  useEffect(() => {
    if (ready) go({ to: 'goal' });
  }, [ready]);
  // Everything was installed elsewhere meanwhile: connecting the agent is what's left.
  const nothing = Boolean(!wanted && data && !agentMissing(data));
  useEffect(() => {
    if (nothing) go({ to: 'connect', then: { to: 'goal' } });
  }, [nothing]);

  if (error) return <Failed error={error} retry={reload} />;
  if (!data) return null;
  // An experimental agent installs from Connect, where it says so, not in one click here.
  const choices = data.filter((a) => a.canInstall && !a.experimental);

  async function start() {
    try {
      await api.installAgent(choice);
      setWanted(choice);
    } catch (e) {
      fail(e);
    }
  }

  async function act(call: () => Promise<void>) {
    try {
      await call();
      reload();
    } catch (e) {
      fail(e);
    }
  }

  return (
    <main className="center">
      <div className="stack wide setup-page">
        <h1 className="h1 a-up">Set up this computer</h1>
        <p className="sub a-up" style={stagger(1)}>code-learn installs what's missing, each from its maker.</p>
        <ul className="stack plain">
            <li className="card check a-up" style={stagger(2)} aria-label="Agent">
              <div className="check-head">
                {agent?.state === 'connected' && <Status kind="ok" size={24} />}
                <b id="agent-t">{agent ? agent.name : 'Your agent'}</b>
              </div>
              {!wanted ? (
                <>
                  <div className="depth" role="radiogroup" aria-labelledby="agent-t">
                    {choices.map((a) => (
                      <label key={a.id} className={`opt${choice === a.id ? ' on' : ''}`}>
                        <input type="radio" name="agent" value={a.id} checked={choice === a.id} onChange={() => setChoice(a.id)} />
                        {a.name}
                      </label>
                    ))}
                  </div>
                  {TERMS[choice] && (
                    <p className="quiet-text">{choices.find((a) => a.id === choice)?.name} is from {TERMS[choice]!.vendor}. Its terms apply. <ExternalLink className="inline" href={TERMS[choice]!.url}>Read them</ExternalLink></p>
                  )}
                </>
              ) : agent?.state === 'connected' ? (
                <span className="quiet-text">Ready</span>
              ) : agent?.state === 'signed-out' ? (
                <div className="actions">
                  <Button onClick={() => act(() => api.signIn(agent.id))}>Sign in</Button>
                </div>
              ) : agent ? (
                <>
                  <InstallProgress agent={agent} />
                  {agent.install?.phase === 'failed' && <div className="actions"><Button onClick={() => act(() => api.installAgent(agent.id))}>Try again</Button></div>}
                  {!running(agent.install) && agent.install?.phase !== 'failed' && <span className="quiet-text">Checking</span>}
                </>
              ) : null}
            </li>
        </ul>
        {!wanted && (
          <div className="actions a-up" style={stagger(4)}>
            <Button size="lg" onClick={start}>Install what's missing</Button>
            <Button variant="text" onClick={() => go({ to: 'connect', then: { to: 'goal' } })}>Do it myself</Button>
          </div>
        )}
      </div>
      {stale !== undefined && <Stale error={stale} retry={reload} />}
    </main>
  );
}

