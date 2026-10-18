import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { AnswersProvider } from './survey/AnswersContext';
import './styles.css';

// Scroll animations only hide content once we know scripts are running.
document.documentElement.classList.add('js');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AnswersProvider>
        <App />
      </AnswersProvider>
    </BrowserRouter>
  </StrictMode>,
);
