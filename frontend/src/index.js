import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Handle chunk loading errors (stale cache after app update)
window.addEventListener('error', (event) => {
  // Check if it's a chunk loading error
  if (event.message && (
    event.message.includes('Loading chunk') ||
    event.message.includes('Loading CSS chunk') ||
    event.message.includes('Failed to fetch dynamically imported module')
  )) {
    console.log('Chunk loading error detected, reloading page...');
    // Clear service worker cache and reload
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name));
      }).then(() => {
        window.location.reload();
      });
    } else {
      window.location.reload();
    }
  }
});

// Also catch unhandled promise rejections for dynamic imports
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.message && (
    event.reason.message.includes('Loading chunk') ||
    event.reason.message.includes('Failed to fetch dynamically imported module')
  )) {
    console.log('Chunk loading rejection detected, reloading page...');
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => caches.delete(name));
      }).then(() => {
        window.location.reload();
      });
    } else {
      window.location.reload();
    }
  }
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);