import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WatchPlayer } from '@/components/WatchPlayer';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WatchPlayer />
  </StrictMode>,
);
