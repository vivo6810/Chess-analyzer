/**
 * The username key, in its own module.
 *
 * Imported by both the auth layer and the query layer, and pulled into pure
 * parsers through the service. It needs nothing: keeping it leaf-shaped is
 * what lets `node --test` load `service.ts` without reaching `next/headers`
 * (which `auth.ts` owns, being the only module that talks to cookies).
 */
export const normalizeUsername = (username: string) => username.trim().toLowerCase();
