import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Static docs, gated to @devxlabs.ai via IAP at the edge (see infra/). Built to ./dist.
export default defineConfig({
  site: 'https://docs.claudex.internal',
  integrations: [
    starlight({
      title: 'claudex',
      tagline: 'multi-account switching · pooling · rate-limit tooling for Claude Code',
      description: 'How every claudex feature works — with motion-graphic explainers.',
      customCss: ['./src/styles/theme.css'],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/vishalmakwana111/claudex' },
      ],
      sidebar: [
        { label: 'Start here', items: [
          { label: 'What is claudex', slug: 'index' },
          { label: 'Install', slug: 'start/install' },
          { label: 'Architecture', slug: 'start/architecture' },
        ] },
        { label: 'Accounts', autogenerate: { directory: 'accounts' } },
        { label: 'Usage & rate limits', autogenerate: { directory: 'usage' } },
        { label: 'Autoswitch', autogenerate: { directory: 'autoswitch' } },
        { label: 'Pooling', autogenerate: { directory: 'pooling' } },
        { label: 'Sessions & keep-warm', autogenerate: { directory: 'sessions' } },
        { label: 'Diagnostics & updates', autogenerate: { directory: 'ops' } },
        { label: 'API', autogenerate: { directory: 'api' } },
      ],
    }),
  ],
});
