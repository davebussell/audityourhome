import { defineConfig } from 'astro/config';

// Sitemaps (one per country), hreflang links, legacy-URL redirect pages and the Netlify
// redirect rules are produced after the build by tools/country/postbuild.mjs.

// https://astro.build/config
export default defineConfig({
  site: 'https://audityourhome.com',
  build: {
    format: 'directory',
  },
});
