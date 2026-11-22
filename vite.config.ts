import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// base './' makes the build work from any path (GitHub Pages subfolder, artifact, file server).
export default defineConfig({
  base: './',
  plugins: [preact()],
});
