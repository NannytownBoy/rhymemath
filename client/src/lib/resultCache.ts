// In-memory cache for passing results between pages without DB round-trip.
// Survives navigation within the same session. Not persisted — share URLs
// still load from DB as fallback.

const cache = new Map<string, any>();

export function cacheResult(id: string, result: any) {
  cache.set(id, result);
}

export function getCachedResult(id: string): any | null {
  return cache.get(id) ?? null;
}
