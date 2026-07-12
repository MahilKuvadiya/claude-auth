// Consistent error envelope: { error: { code, message, requestId, details? } }.
// Applied via setErrorHandler + setNotFoundHandler in server.js.

// gRPC transient codes worth surfacing as 503 rather than 500.
const GRPC_TO_HTTP = { 4: 504, 14: 503, 10: 409, 5: 404, 6: 409, 7: 403 };

export function installErrorHandlers(app) {
  app.setErrorHandler((err, req, reply) => {
    let status = err.statusCode;
    let code = err.code || 'internal';

    if (err.validation) {                       // Fastify/Ajv schema failure
      status = 400; code = 'invalid_request';
    } else if (!status && Number.isInteger(err.code) && GRPC_TO_HTTP[err.code]) {
      status = GRPC_TO_HTTP[err.code]; code = 'upstream_unavailable';
    }
    status = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;

    // Never leak internals or tokens on a 5xx.
    const message = status >= 500 ? 'internal error' : err.message;
    if (status >= 500) req.log.error({ err }, 'request failed');
    else req.log.warn({ code, msg: err.message }, 'request rejected');

    const body = { error: { code, message, requestId: req.id } };
    if (err.validation) body.error.details = err.validation;
    reply.code(status).send(body);
  });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({
      error: { code: 'not_found', message: `no route for ${req.method} ${req.url}`, requestId: req.id },
    });
  });
}
