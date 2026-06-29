import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import packageJson from './package.json' with { type: 'json' };

export default defineConfig({
  plugins: [svelte()],
  define: {
    'import.meta.env.PACKAGE_VERSION': JSON.stringify(packageJson.version),
  },
  server: {
    allowedHosts: ['.loca.lt'],
  },
  preview: {
    allowedHosts: ['.loca.lt'],
  },
});
