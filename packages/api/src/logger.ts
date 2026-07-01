import pino from 'pino';

export function createLogger(name = 'sniffoutpro-api') {
  return pino({
    name,
    level: process.env['LOG_LEVEL'] ?? 'info',
  });
}

export type Logger = ReturnType<typeof createLogger>;
