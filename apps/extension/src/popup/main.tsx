import { createRoot } from 'react-dom/client';
import { Popup } from './Popup.js';
import '@live-translator/ui/styles.css';

const style = document.createElement('style');
style.textContent = `
  html, body, #root {
    margin: 0;
    padding: 0;
    background: #0b0c0f;
  }
  * { box-sizing: border-box; }
  button:focus-visible, input:focus-visible {
    outline: 2px solid #f7f7f8;
    outline-offset: 2px;
  }
  @keyframes lt-spin { to { transform: rotate(360deg); } }
  @keyframes lt-pulse {
    0% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.45); }
    70% { box-shadow: 0 0 0 8px rgba(74, 222, 128, 0); }
    100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
  }
  @keyframes lt-fade {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    * { animation: none !important; transition: none !important; }
  }
`;
document.head.appendChild(style);

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<Popup />);
}
