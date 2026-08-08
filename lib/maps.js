// Looks up real drive time / distance between two addresses using the
// Google Maps Distance Matrix API. Requires GOOGLE_MAPS_API_KEY (separate
// from the Calendar/Sheets OAuth credentials — this one's a simple API key).
// Falls back to null (caller uses a flat buffer / skips the rule) if the
// key is missing or the lookup fails, so the app degrades gracefully.

const cache = new Map(); // avoid repeat lookups for the same pair within one request

export async function driveTimeMinutes(originAddress, destAddress) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !originAddress || !destAddress) return null;

  const cacheKey = `${originAddress}|${destAddress}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const params = new URLSearchParams({
      origins: originAddress,
      destinations: destAddress,
      key,
    });
    const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params}`);
    const data = await res.json();
    const el = data?.rows?.[0]?.elements?.[0];
    if (!el || el.status !== "OK") {
      console.log("[driveTimeMinutes] failed — top-level status:", data.status, "element status:", el?.status, "error_message:", data.error_message);
      cache.set(cacheKey, null);
      return null;
    }
    // duration_in_traffic if available (more realistic), else plain duration
    const seconds = el.duration_in_traffic?.value ?? el.duration.value;
    const minutes = Math.ceil(seconds / 60);
    cache.set(cacheKey, minutes);
    return minutes;
  } catch {
    return null;
  }
}

const distanceCache = new Map();

// Straight driving distance in miles, e.g. for "is this property far enough
// away to trigger a trip charge / earlier cutoff / same-day exclusion" rules.
// Returns null (rule is skipped, not enforced) if the key is missing or the
// lookup fails.
export async function driveDistanceMiles(originAddress, destAddress) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key || !originAddress || !destAddress) return null;

  const cacheKey = `${originAddress}|${destAddress}`;
  if (distanceCache.has(cacheKey)) return distanceCache.get(cacheKey);

  try {
    const params = new URLSearchParams({
      origins: originAddress,
      destinations: destAddress,
      key,
    });
    const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params}`);
    const data = await res.json();
    const el = data?.rows?.[0]?.elements?.[0];
    if (!el || el.status !== "OK") {
      console.log("[driveDistanceMiles] failed — top-level status:", data.status, "element status:", el?.status, "error_message:", data.error_message);
      distanceCache.set(cacheKey, null);
      return null;
    }
    const miles = el.distance.value / 1609.344;
    distanceCache.set(cacheKey, miles);
    return miles;
  } catch (err) {
    console.log("[driveDistanceMiles] threw:", err.message);
    return null;
  }
}
