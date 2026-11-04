import { defineConfig } from 'vitest/config';

// "@/…" means src/, as in the app.
export default defineConfig({
  resolve: { alias: [{ find: /^@\//, replacement: '/src/' }] },
});
