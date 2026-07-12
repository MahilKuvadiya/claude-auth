export default async function healthRoutes(app) {
  app.get('/healthz', async () => ({ ok: true }));
  app.get('/v1/health', async () => ({ ok: true, service: 'claudex-api', version: '1' }));
}
