import { createContext, useContext } from 'react';
import type { Bridge, CodeLearnApi } from '../../shared/api';

export const ApiContext = createContext<CodeLearnApi | null>(null);

export function useApi(): CodeLearnApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('No CodeLearnApi provided');
  return api;
}

/** A typed CodeLearnApi whose every call goes through the preload bridge; check progress, job progress and Run's output are the bridge's events. */
export function bridgeClient(bridge: Bridge): CodeLearnApi {
  return new Proxy({} as CodeLearnApi, {
    get: (_target, method) => {
      if (method === 'onCheckProgress') return bridge.onCheckProgress;
      if (method === 'onJobProgress') return bridge.onJobProgress;
      if (method === 'onRunOutput') return bridge.onRunOutput;
      return typeof method === 'string' && method !== 'then' ? (...args: unknown[]) => bridge.invoke(method, args) : undefined;
    },
  });
}
