import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initErrorReporter } from './utils/errorReporter';
import { startTrackingSession } from './utils/track';
import App from './App';
import './index.css';
import './styles/site.css';

initErrorReporter();
// Before the first render, so before the address-bar sync rewrites the URL
startTrackingSession();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
