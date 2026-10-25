/**
 * The service error, in its own module.
 *
 * Pure logic below the query layer — the PGN parser, the rating walker — can
 * fail loudly without reaching anything runtime-specific. That is also what
 * keeps `node --test` able to load them: this module imports nothing, so a
 * test file that throws `ServiceError` never pulls `service.ts` (and through
 * it `auth.ts`, and through *that*, `next/headers`).
 */
export class ServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceError';
  }
}
