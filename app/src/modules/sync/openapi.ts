/**
 * P10 T01 — Sync-module-only OpenAPI 3.1 spec (D-03: no other modules included).
 *
 * Schemas are hand-authored from the Drizzle inferred types for sync_events /
 * sync_conflicts / sync_verify_captures. The spec is mounted at `/openapi.json`
 * and the Scalar UI is mounted at `/docs` in server.ts.
 */

export const syncOpenApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'TLP Services — Sync API',
    version: '1.0.0',
    description:
      'GHL ↔ DrChrono bidirectional sync: event inspection, conflict resolution, dead-letter replay, and metrics. Per D-03, this spec covers /api/sync/* ONLY.',
  },
  servers: [{ url: '' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      SyncEventStatus: {
        type: 'string',
        enum: ['pending', 'processed', 'failed', 'dead'],
      },
      SyncEventSource: {
        type: 'string',
        enum: ['ghl', 'drchrono'],
      },
      SyncEvent: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          source: { $ref: '#/components/schemas/SyncEventSource' },
          action: { type: 'string', example: 'appointment.created' },
          dedupKey: { type: 'string' },
          status: { $ref: '#/components/schemas/SyncEventStatus' },
          payload: { type: 'object', nullable: true },
          error: { type: 'string', nullable: true },
          receivedAt: { type: 'string', format: 'date-time' },
          processedAt: { type: 'string', format: 'date-time', nullable: true },
        },
        required: ['id', 'source', 'action', 'status', 'receivedAt'],
      },
      ConflictResolution: {
        type: 'string',
        enum: ['pending', 'manual-resolved', 'auto-resolved', 'skip'],
      },
      SyncConflict: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          source: { type: 'string' },
          entity: { type: 'string' },
          resolution: { $ref: '#/components/schemas/ConflictResolution' },
          resolvedBy: { type: 'string', nullable: true },
          resolvedAt: { type: 'string', format: 'date-time', nullable: true },
          diffJson: { type: 'object', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'source', 'entity', 'resolution', 'createdAt'],
      },
      SyncVerifyCapture: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          direction: { type: 'string', nullable: true, example: 'drchrono→ghl' },
          eventId: { type: 'string', nullable: true },
          wouldHaveSent: { type: 'object', nullable: true },
          capturedAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'capturedAt'],
      },
      SyncMetrics: {
        type: 'object',
        properties: {
          sync_writes_attempted: { type: 'integer' },
          sync_writes_succeeded: { type: 'integer' },
          sync_writes_failed: { type: 'integer' },
          sync_writes_skipped_loop: { type: 'integer' },
          sync_writes_skipped_off: { type: 'integer' },
          sync_dry_run_actions: { type: 'integer' },
          sync_dead_letter_count: { type: 'integer' },
          sync_conflict_queue_size: { type: 'integer' },
          patients_dual_write_pg_fail: { type: 'integer' },
          per_direction: {
            type: 'object',
            properties: {
              drchrono_to_ghl: {
                type: 'object',
                properties: {
                  attempted: { type: 'integer' },
                  succeeded: { type: 'integer' },
                  failed: { type: 'integer' },
                },
              },
              ghl_to_drchrono: {
                type: 'object',
                properties: {
                  attempted: { type: 'integer' },
                  succeeded: { type: 'integer' },
                  failed: { type: 'integer' },
                },
              },
            },
          },
        },
        required: [
          'sync_writes_attempted',
          'sync_writes_succeeded',
          'sync_writes_failed',
          'sync_writes_skipped_loop',
          'sync_writes_skipped_off',
          'sync_dry_run_actions',
          'sync_dead_letter_count',
          'sync_conflict_queue_size',
          'patients_dual_write_pg_fail',
          'per_direction',
        ],
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
        },
        required: ['error'],
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/api/sync/metrics': {
      get: {
        tags: ['Metrics'],
        summary: 'In-process sync counters',
        description:
          'Returns current in-process counters. Add ?format=prom for Prometheus text format. Counters reset on process restart — best-effort; durable counts come from PG queries.',
        parameters: [
          {
            in: 'query',
            name: 'format',
            schema: { type: 'string', enum: ['json', 'prom'] },
            description: 'Response format. Default: json.',
          },
        ],
        responses: {
          '200': {
            description: 'Counters',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SyncMetrics' },
              },
              'text/plain': {
                schema: { type: 'string' },
                description: 'Prometheus text format (when ?format=prom)',
              },
            },
          },
        },
      },
    },
    '/api/sync/invariants': {
      get: {
        tags: ['Invariants'],
        summary: 'Run the self-heal invariant pass on demand',
        description:
          'HEAL-01 silent-wrong INVARIANT-CHECK layer. READ-ONLY: runs every invariant once and returns pass/fail results. Violations also fire an `invariant_violation` Telegram alert. The same pass runs on a timer when RUN_INVARIANTS=on.',
        responses: {
          '200': {
            description: 'Invariant results',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean' },
                    violations: { type: 'integer' },
                    results: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', example: 'I6' },
                          description: { type: 'string' },
                          ok: { type: 'boolean' },
                          detail: { type: 'string' },
                          tier: { type: 'string', enum: ['Tier 1', 'Tier 2'] },
                        },
                        required: ['id', 'description', 'ok', 'detail'],
                      },
                    },
                  },
                  required: ['ok', 'violations', 'results'],
                },
              },
            },
          },
          '500': { description: 'Internal error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/sync/events': {
      get: {
        tags: ['Events'],
        summary: 'List sync events',
        parameters: [
          {
            in: 'query',
            name: 'status',
            schema: { $ref: '#/components/schemas/SyncEventStatus' },
          },
          {
            in: 'query',
            name: 'limit',
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
          },
        ],
        responses: {
          '200': {
            description: 'Events list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    events: { type: 'array', items: { $ref: '#/components/schemas/SyncEvent' } },
                  },
                  required: ['events'],
                },
              },
            },
          },
        },
      },
    },
    '/api/sync/events/replay/{id}': {
      post: {
        tags: ['Events'],
        summary: 'Replay a sync event',
        description: 'Re-arms an event to status=pending so the engine reprocesses it. Returns 202.',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '202': {
            description: 'Accepted — event re-armed',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'pending' },
                    id: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
          '404': { description: 'Event not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/sync/conflicts': {
      get: {
        tags: ['Conflicts'],
        summary: 'List sync conflicts',
        parameters: [
          {
            in: 'query',
            name: 'resolution',
            schema: { $ref: '#/components/schemas/ConflictResolution' },
            description: 'Default: pending',
          },
          {
            in: 'query',
            name: 'limit',
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
          },
        ],
        responses: {
          '200': {
            description: 'Conflicts list',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    conflicts: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/SyncConflict' },
                    },
                  },
                  required: ['conflicts'],
                },
              },
            },
          },
        },
      },
    },
    '/api/sync/conflicts/{id}/resolve': {
      post: {
        tags: ['Conflicts'],
        summary: 'Resolve a pending conflict',
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  decision: {
                    type: 'string',
                    enum: ['apply-source', 'apply-target', 'skip'],
                  },
                  resolvedBy: { type: 'string' },
                },
                required: ['decision'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Resolved',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string', example: 'manual-resolved' },
                    id: { type: 'string', format: 'uuid' },
                    decision: { type: 'string' },
                  },
                },
              },
            },
          },
          '400': { description: 'Invalid decision', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          '404': { description: 'Pending conflict not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
        },
      },
    },
    '/api/sync/verify-sink': {
      get: {
        tags: ['Verify Sink'],
        summary: 'List captured verify-mode envelopes',
        security: [],
        parameters: [
          {
            in: 'query',
            name: 'limit',
            schema: { type: 'integer', minimum: 1, maximum: 500, default: 50 },
          },
        ],
        responses: {
          '200': {
            description: 'Captures',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    captures: {
                      type: 'array',
                      items: { $ref: '#/components/schemas/SyncVerifyCapture' },
                    },
                  },
                  required: ['captures'],
                },
              },
            },
          },
        },
      },
      post: {
        tags: ['Verify Sink'],
        summary: 'Capture a verify-mode outbound write envelope',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  direction: { type: 'string' },
                  eventId: { type: 'string' },
                  wouldHaveSent: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Captured',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    captured: { type: 'boolean' },
                    id: { type: 'string', format: 'uuid' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;
