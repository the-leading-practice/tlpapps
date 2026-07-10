import { pino } from 'pino';

export const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
  level: process.env.LOG_LEVEL || 'info',
  // EDGE-01 — the `olx_` gateway token (plaintext or ciphertext) must never be
  // emitted to logs. Cover every field-name variant the Edge module might log.
  redact: {
    paths: [
      'req.body.token',
      'edgeToken',
      'edge_token_ciphertext',
      'edgeTokenCiphertext',
      '*.edgeToken',
      '*.edge_token_ciphertext',
      '*.edgeTokenCiphertext',
    ],
    censor: '[REDACTED]',
  },
});
