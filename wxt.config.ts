import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Google One Offer Explorer',
    description: 'Inspect Google One offers visible in your browser. No checkout changes or data collection.',
    permissions: ['activeTab'],
  },
});
