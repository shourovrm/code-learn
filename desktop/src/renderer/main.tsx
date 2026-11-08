import './styles/fonts.css';
import './styles/tokens.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Bridge } from '../shared/api';
import { App } from './app/App';
import { bridgeClient } from './app/api';
import { initTheme } from './app/theme';

declare global {
  interface Window {
    codeLearn: Bridge;
  }
}

// Before the first render, so a dark theme never flashes light.
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App api={bridgeClient(window.codeLearn)} />
  </StrictMode>,
);
