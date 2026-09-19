import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { aplicarTema } from './theme';
import { App } from './ui/App';
import './ui/estilos.css';

aplicarTema();

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
