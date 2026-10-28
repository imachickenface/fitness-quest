import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App.tsx';
import { keepInviteFromUrl } from './ui/social/inviteLanding.ts';
import './ui/index.css';

// an invite link's token is kept before anything else reads the address
keepInviteFromUrl();

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
