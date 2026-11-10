import { useEffect, useMemo, useRef, useState } from 'react';
import type { CodeLearnApi } from '../../shared/api';
import { Connect } from '../features/connect/Connect';
import { Models } from '../features/connect/Models';
import { Welcome } from '../features/connect/Welcome';
import { Computer } from '../features/computer/Computer';
import { CourseEditor } from '../features/course/CourseEditor';
import { Goal } from '../features/learn/Goal';
import { Lesson } from '../features/lessons/Lesson';
import { TopicPage } from '../features/lessons/TopicPage';
import { Practice } from '../features/practice/Practice';
import { CourseMap } from '../features/progress/CourseMap';
import { Research } from '../features/research/Research';
import { Setup } from '../features/setup/Setup';
import { Tracks } from '../features/tracks/Tracks';
import { CoursesPage } from '../features/courses/CoursesPage';
import { Settings } from '../features/settings/Settings';
import { Button } from '../ui/Button';
import { ApiContext } from './api';
import { CloseGuard } from './CloseGuard';
import { problemOf, sayOf } from './errors';
import { historyAfterGo, RouterContext, type Route, type Router } from './router';
import { useRouteFocus } from './useRouteFocus';
import { WithSide } from './Sidebar';

/** `visit` counts navigations, so going to the screen already shown can open it fresh. */
function Screen({ route, visit }: { route: Route; visit: number }) {
  switch (route.to) {
    case 'welcome':
      return <Welcome />;
    case 'connect':
      return <Connect then={route.then} check={route.check} />;
    case 'models':
      return <Models then={route.then} />;
    case 'computer':
      return <Computer then={route.then} fromConnect={route.fromConnect} />;
    case 'setup':
      return <Setup />;
    case 'goal':
      return <WithSide><Goal /></WithSide>;
    case 'research':
      return <WithSide><Research goal={route.goal} /></WithSide>;
    case 'course':
      return <WithSide><CourseEditor roadmap={route.roadmap} /></WithSide>;
    case 'topic':
      return <WithSide><TopicPage topicId={route.topicId} /></WithSide>;
    case 'learn':
      return <WithSide><CourseMap key={route.course} /></WithSide>;
    case 'courses':
      return <WithSide><CoursesPage /></WithSide>;
    case 'tracks':
      return <WithSide><Tracks /></WithSide>;
    case 'settings':
      return <WithSide><Settings /></WithSide>;
    case 'lesson':
      return <Lesson key={route.lessonId} lessonId={route.lessonId} />;
    case 'practice':
      // Continue after a pass that didn't master the topic leads to the same topic's next activity: it opens fresh.
      return <Practice key={visit} concept={route.concept} />;
  }
}

export function App({ api, start = { to: 'welcome' } }: { api: CodeLearnApi; start?: Route }) {
  const [{ route, visit, history }, setPlace] = useState({ route: start, visit: 0, history: [] as Route[] });
  const setRoute = (next: Route) => setPlace((p) => ({ route: next, visit: p.visit + 1, history: historyAfterGo(p.history, p.route, next) }));
  const goBack = () =>
    setPlace((p) => {
      const previous = p.history.at(-1);
      if (!previous) return p;
      return { route: previous, visit: p.visit + 1, history: p.history.slice(0, -1) };
    });
  const [failed, setFailed] = useState<{ text: string; agent: boolean }>();
  const body = useRef<HTMLDivElement>(null);
  useRouteFocus(route, body);
  const router = useMemo<Router>(
    () => ({
      route,
      go: (next) => {
        setFailed(undefined);
        setRoute(next);
      },
      back: () => {
        setFailed(undefined);
        goBack();
      },
      canGoBack: history.length > 0,
      fail: (error, resume = route) => {
        const problem = problemOf(error);
        if (problem === 'connect') {
          setFailed(undefined);
          setRoute({ to: 'connect', then: resume, check: true });
          return;
        }
        console.error(error);
        setFailed({ text: sayOf(error, problem), agent: problem === 'agent' });
      },
    }),
    [route, history],
  );
  useBackShortcuts(router.back);
  return (
    <ApiContext.Provider value={api}>
      <RouterContext.Provider value={router}>
        <div className="win">
          <div className="tbar">code-learn</div>
          <div className="wbody" ref={body}>
            <Screen route={route} visit={visit} />
          </div>
          <CloseGuard />
          {failed && (
            <div className="failed" role="alert">
              {failed.text}
              {failed.agent && <Button variant="text" onClick={() => router.go({ to: 'connect', then: route, check: true })}>Check your agent</Button>}
              <Button variant="text" onClick={() => setFailed(undefined)}>Dismiss</Button>
            </div>
          )}
        </div>
      </RouterContext.Provider>
    </ApiContext.Provider>
  );
}

/** Alt+Left and the mouse's back button go back, as in a browser. */
function useBackShortcuts(back: () => void) {
  const latest = useRef(back);
  latest.current = back;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !event.altKey || event.key !== 'ArrowLeft') return;
      event.preventDefault();
      latest.current();
    };
    // Button 3 is the mouse's back button.
    const onMouse = (event: MouseEvent) => {
      if (event.button === 3) latest.current();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onMouse);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mouseup', onMouse);
    };
  }, []);
}
