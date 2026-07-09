import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

const site = process.env.PUBLIC_SITE_URL || 'https://thebuilderofmoebius9.github.io';
const base = process.env.PUBLIC_BASE_PATH ?? '/atom-landing';

export default defineConfig({
  site,
  base,
  output: 'static',
  integrations: [react()],
  vite: { plugins: [tailwindcss()] }
});
