import { render } from 'preact';
import { App, type PackResult } from './ui/App';
import { loadPack } from './content/load-browser';
import './ui/styles.css';

const root = document.getElementById('app')!;
const mount = (packResult: PackResult) => render(<App packResult={packResult} />, root);

mount(loadPack());

// Writers edit YAML in content/ and see the change instantly, without losing the current run.
if (import.meta.hot) {
  import.meta.hot.accept('./content/load-browser', (mod) => {
    if (mod) mount((mod as unknown as typeof import('./content/load-browser')).loadPack());
  });
}
