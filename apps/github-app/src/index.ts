import { pathToFileURL } from 'node:url';
import { logger } from '@openmaintainer/logger';
import { buildServer } from './server.js';
import { loadEnvironment } from './environment.js';
export { buildServer } from './server.js';
export type { AppOptions } from './options.js';

async function main(): Promise<void> {
  const { options, port } = await loadEnvironment();
  const app = buildServer(options);
  await app.listen({ port, host: '0.0.0.0' });
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      void app.close();
    });
  logger.info({ port }, 'openmaintainer.started');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch(() => {
    logger.fatal(
      'Startup failed. Check configuration and required environment variables; secrets are not logged.',
    );
    process.exitCode = 1;
  });
