import './styles/fonts.css';
import './styles/tokens.css';
import './styles/foundation.css';
import './styles/workspace.css';
import './styles/progress.css';
import './styles/setup.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Bridge } from '../shared/api';
import { App } from './app/App';
import { bridgeClient } from './app/api';
import { initTextSize } from './app/textSize';
import { initTheme } from './app/theme';

declare global {
  interface Window {
    codeLearn: Bridge;
  }
}

// Before the first render, so a dark theme never flashes light.
initTheme();
initTextSize();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App api={bridgeClient(window.codeLearn)} />
  </StrictMode>,
);
