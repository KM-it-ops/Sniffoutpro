import { Buffer } from 'buffer';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

if (typeof globalThis.Buffer === 'undefined') {
  (globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;
}
const root = document.querySelector<HTMLDivElement>('#app');
if (root === null) {
  document.body.innerHTML =
    '<main style="padding:2rem;font-family:Segoe UI,sans-serif"><h1>Missing #app root</h1></main>';
} else {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
