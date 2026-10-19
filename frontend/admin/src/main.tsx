import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { OpsApp } from './OpsApp';
import { applyTheme, readTheme } from '../../src/lib/theme';
import '../../src/styles.css';
import './ops.css';

applyTheme(readTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename="/ops">
      <OpsApp />
    </BrowserRouter>
  </StrictMode>,
);
