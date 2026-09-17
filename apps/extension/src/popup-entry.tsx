import { createRoot } from 'react-dom/client';
import { Popup } from './popup.js';
import { installPopupDismissal } from './popup-lifecycle.js';
import './index.css';

// A popup.html opened as a regular tab or the Vite preview must stay open when
// switching tabs. Only Chrome's actual action popup gets automatic dismissal.
if (
  typeof chrome !== 'undefined' &&
  chrome.extension?.getViews({ type: 'popup' }).includes(window)
) {
  installPopupDismissal(window);
}

const root = document.getElementById('root');
if (root) createRoot(root).render(<Popup />);
