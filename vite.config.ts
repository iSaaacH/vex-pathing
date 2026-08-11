import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Project-pages URL: https://isaaach.github.io/vex-pathing/
export default defineConfig({
  base: '/vex-pathing/',
  plugins: [svelte()],
});
