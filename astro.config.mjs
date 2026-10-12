import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'node:fs';

// Account pages are never indexed; the alerts page only once accounts are on.
const accounts = JSON.parse(readFileSync(new URL('./src/config/accounts.json', import.meta.url), 'utf8'));
const accountsOn = Boolean((process.env.PUBLIC_SUPABASE_URL || accounts.supabaseUrl) && (process.env.PUBLIC_SUPABASE_KEY || accounts.supabaseKey));

// https://astro.build/config
export default defineConfig({
  site: 'https://audityourhome.com',
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/account/') && (accountsOn || !page.endsWith('/alerts/')),
    }),
  ],
  // Short, say-it-on-the-phone address for the advisor lead offer.
  redirects: {
    '/advisors': '/for-professionals/',
  },
  build: {
    format: 'directory',
  },
});
