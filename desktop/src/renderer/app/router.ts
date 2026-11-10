import { createContext, useContext } from 'react';
import type { Goal, Roadmap } from '../../shared/api';

export type Route =
  | { to: 'welcome' }
  | { to: 'connect'; then?: Route }
  /** `fromConnect`: the check on the way in from Connect, which moves on by itself when the computer is ready. */
  | { to: 'computer'; then: Route; fromConnect?: true }
  | { to: 'setup' }
  | { to: 'goal' }
  | { to: 'research'; goal: Goal }
  | { to: 'course'; roadmap: Roadmap }
  | { to: 'topic'; topicId: string }
  | { to: 'lesson'; lessonId: string }
  | { to: 'practice'; concept: string }
  /** `course`: the course just put on screen, so its map opens fresh (§4.13). */
  | { to: 'learn'; course?: string }
  | { to: 'courses' }
  | { to: 'tracks' }
  | { to: 'settings' };

export interface Router {
  route: Route;
  go: (route: Route) => void;
  /** Goes to the screen before, when there is one to go back to (`canGoBack`). */
  back: () => void;
  canGoBack: boolean;
  /**
   * Reports a failed call. An agent that is missing or signed out opens
   * connect, then returns to `resume` (default: this route). Anything else is
   * said in a banner.
   */
  fail: (error: unknown, resume?: Route) => void;
}

export const RouterContext = createContext<Router | null>(null);

export function useRouter(): Router {
  const router = useContext(RouterContext);
  if (!router) throw new Error('No router');
  return router;
}

/**
 * The screens Back can return to: the course and its parts. Setup steps (connect, the computer check, research, the
 * roadmap editor) are left out, because opening one again would restart its work.
 */
const BACK_TARGETS: ReadonlySet<Route['to']> = new Set(['learn', 'topic', 'lesson', 'practice', 'courses', 'tracks']);

/** How many screens Back remembers. */
const BACK_LIMIT = 50;

export const sameRoute = (a: Route, b: Route) => JSON.stringify(a) === JSON.stringify(b);

/** The Back history after going from `from` to `to`. */
export function historyAfterGo(history: Route[], from: Route, to: Route): Route[] {
  if (!BACK_TARGETS.has(from.to) || sameRoute(from, to)) return history;
  // A course map opened "fresh" (`course`) is the plain map once the learner has seen it.
  const remembered: Route = from.to === 'learn' ? { to: 'learn' } : from;
  return [...history, remembered].slice(-BACK_LIMIT);
}
