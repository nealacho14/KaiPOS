/**
 * Defensive cast for document `_id` values. The codebase convention is
 * UUID strings (see `crypto.randomUUID()` on every insert), but records
 * created out-of-band — e.g. manual Atlas inserts — can end up with a
 * Mongo `ObjectId`. Downstream `$jsonSchema` validators require fields
 * like `createdBy`, `userId`, etc. to be `string`, and a serialized
 * `ObjectId` in a JWT payload produces channel names like
 * `user:[object Object]`. Calling `String()` is a no-op for strings and
 * returns the 24-char hex form for ObjectIds.
 */
export function idToString(id: unknown): string {
  return typeof id === 'string' ? id : String(id);
}
