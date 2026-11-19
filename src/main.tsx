import { createRoot } from 'react-dom/client';
import '@fontsource/vt323/index.css';
import '@fontsource/press-start-2p/index.css';
import './styles.css';
import App from './App';

// No StrictMode: the game engine owns a canvas, a rAF loop and window-level
// listeners; double-mounted effects would fight over them.
createRoot(document.getElementById('root')!).render(<App />);
