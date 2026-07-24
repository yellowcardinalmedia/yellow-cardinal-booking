import { BUSINESS } from "./config";
import { driveTimeMinutes } from "./maps";

function pad(n) {
  return String(n).padStart(2, "0");
}

// Build a Date representing HH:MM on a given YYYY-MM-DD in the business timezone,
// using Intl to find the correct UTC offset for that date (handles DST correctly).
function zonedDateTime(dateStr, hhmm, timeZone) {
  const [h, m] = hhmm.split(":").map(Number);
  const naive = new Date(`${dateStr}T${pad(h)}:${pad(m)}:00Z`);
  const tzString = naive.toLocaleString("en-US", { timeZone });
  const tzDate = new Date(tzString);
  const diff = naive.getTime() - tzDate.getTime();
  return new Date(naive.getTime() + diff);
}

// Gap (in minutes) required between one shoot and the next. Tries real drive
// time first (Google Maps); falls back to the flat buffer if addresses are
// missing or the Maps API isn't configured.
async function requiredGapMinutes(fromAddress, toAddress) {
  if (fromAddress && toAddress) {
    const drive = await driveTimeMinutes(fromAddress, toAddress);
    if (drive !== null) return drive + 10; // small pad on top of raw drive time
  }
  return BUSINESS.bufferMinutesBetweenShoots;
}

export async function generateSlotsForDay(dateStr, durationMinutes, busyEvents, newAddress) {
  const dow = new Date(`${dateStr}T12:00:00Z`).getUTCDay();
  const hours = BUSINESS.hours[dow];
  if (!hours) return [];

  const dayStart = zonedDateTime(dateStr, hours.start, BUSINESS.timezone).getTime();
  const dayEnd = zonedDateTime(dateStr, hours.end, BUSINESS.timezone).getTime();
  const step = 15 * 60 * 1000;
  const durationMs = durationMinutes * 60 * 1000;
  const now = Date.now();

  const busy = busyEvents
    .map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime(), location: b.location }))
    .filter((b) => b.end > dayStart && b.start < dayEnd)
    .sort((a, b) => a.start - b.start);

  // Walk the gaps between consecutive events (and before the first / after the
  // last), shrinking each gap by real drive time to/from the new address.
  const slots = [];
  const boundaries = [{ end: dayStart, location: null }, ...busy, { start: dayEnd, location: null }];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const prev = boundaries[i];
    const next = boundaries[i + 1];
    const gapStartRaw = prev.end ?? prev.start;
    const gapEndRaw = next.start ?? next.end;
    if (gapEndRaw <= gapStartRaw) continue;

    const gapBeforeMin = i === 0 ? 0 : await requiredGapMinutes(prev.location, newAddress);
    const gapAfterMin = i === boundaries.length - 2 ? 0 : await requiredGapMinutes(newAddress, next.location);

    const segStart = gapStartRaw + gapBeforeMin * 60000;
    const segEnd = gapEndRaw - gapAfterMin * 60000;

    for (let t = segStart; t + durationMs <= segEnd; t += step) {
      const aligned = Math.ceil((t - dayStart) / step) * step + dayStart; // keep on 15-min grid
      if (aligned + durationMs > segEnd) continue;
      if (aligned < now + 60 * 60 * 1000) continue; // require at least 1hr lead time
      slots.push({ start: new Date(aligned).toISOString(), end: new Date(aligned + durationMs).toISOString() });
    }
  }

  const seen = new Set();
  return slots.filter((s) => (seen.has(s.start) ? false : seen.add(s.start))).sort((a, b) => a.start.localeCompare(b.start));
}
