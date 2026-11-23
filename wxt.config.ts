import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Google One Offer Explorer',
    description: 'Automatically detect Google One plans and eligible-looking offer metadata. No checkout rewrites.',
    permissions: ['activeTab', 'storage'],
  },
});
