import { buildServer } from './server.js';
import { config } from './config.js';

const app = await buildServer();

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => { await app.close(); process.exit(0); });
}
