import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://audityourhome.com',
  integrations: [sitemap()],
  // Short, say-it-on-the-phone address for the advisor lead offer.
  redirects: {
    '/advisors': '/for-professionals/',
  },
  build: {
    format: 'directory',
  },
});
