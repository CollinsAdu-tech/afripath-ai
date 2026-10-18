import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { api } from './api/client';
import { AnswersProvider } from './survey/AnswersContext';
import './styles.css';

// Scroll animations only hide content once we know scripts are running.
document.documentElement.classList.add('js');

// Wake the engine as soon as any page opens (it may be asleep on a free host), before the student needs it.
void api.health().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AnswersProvider>
        <App />
      </AnswersProvider>
    </BrowserRouter>
  </StrictMode>,
);
