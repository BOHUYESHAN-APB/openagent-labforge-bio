export function unsafeTestValue<T>(value: unknown): T {
  return value as T;
}
