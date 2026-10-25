/**
 * The role column on `users`.
 *
 * Roles are no longer minted by the app: tournaments are not hosted here and
 * there is no staff console. The column stays for historical databases, and a
 * leftover 'admin' row is an ordinary reader, not an official.
 */
export type Role = 'user' | 'admin' | 'owner';
