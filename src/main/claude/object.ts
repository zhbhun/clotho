/** Narrow an unknown JSON value to a plain (non-array) object record. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
