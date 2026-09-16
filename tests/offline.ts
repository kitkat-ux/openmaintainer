import { vi } from 'vitest';
// Every network-capable test must inject its transport explicitly.
vi.stubGlobal('fetch', async () => {
  throw new Error('Unexpected network request in offline tests.');
});
