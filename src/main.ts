import './app.css';
import './ui/unitPortraitClusters.css';
import './ui/overworldPrimitives.css';
import App from './ui/App.svelte';

const app = new App({
  target: document.getElementById('app') as HTMLElement,
});

export default app;
