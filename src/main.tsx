import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initErrorReporter } from './utils/errorReporter';
import App from './App';
import './index.css';

initErrorReporter();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
