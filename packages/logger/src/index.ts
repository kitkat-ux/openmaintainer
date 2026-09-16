import pino from 'pino';
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'req.headers.authorization',
      'authorization',
      'apiKey',
      'privateKey',
      'secret',
      '*.api_key',
    ],
    censor: '[REDACTED]',
  },
});
export function operationLog(operation: string, fields: Record<string, unknown> = {}) {
  return logger.child({ operation, ...fields });
}
