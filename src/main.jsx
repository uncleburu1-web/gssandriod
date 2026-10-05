import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './theme.css';
import { isIos } from './utils/platform';

// Lets theme.css apply iPhone-only fixes (status-bar / notch insets) without
// touching how Android or the browser look.
if (isIos) document.documentElement.classList.add('platform-ios');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
