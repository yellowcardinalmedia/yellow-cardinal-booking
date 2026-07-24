// Edit this file to match your real business — products, add-ons, hours, pricing.
// No database needed: this file + your Google Calendar are the source of truth.

export const BUSINESS = {
  name: "Yellow Cardinal Media",
  timezone: "America/Chicago",
  calendarId: "primary", // the Google Calendar to read/write. "primary" = the connected account's main calendar.
  bookingHorizonDays: 30, // how far out clients can book
  // Business hours per weekday (0 = Sunday ... 6 = Saturday). 24h "HH:MM".
  hours: {
    0: null, // closed Sunday
    1: { start: "08:00", end: "17:00" },
    2: { start: "08:00", end: "17:00" },
    3: { start: "08:00", end: "17:00" },
    4: { start: "08:00", end: "17:00" },
    5: { start: "08:00", end: "16:00" },
    6: { start: "09:00", end: "13:00" },
  },
  bufferMinutesBetweenShoots: 30,
  // Extra people who should get every booking's calendar invite, in addition
  // to the client. You (the connected Gmail) already see it since it's on
  // your own calendar — this is for anyone else, e.g. an assistant or partner.
  notifyEmails: [
    "kato@katobentleyphoto.com",
  ],
};

// Each product has a duration (minutes) — this drives slot length and availability math.
export const PRODUCTS = [
  {
    id: "standard",
    name: "Listing Photography Package",
    description: "Interior + exterior photos plus aerial/drone shots, included.",
    durationMinutes: 60,
    price: 195,
  },
];

export const ADDONS = [
  {
    id: "floorplan",
    name: "Floor Plan",
    description: "Measured 2D floor plan, delivered as PDF and image.",
    extraMinutes: 15,
    price: 50,
  },
  {
    id: "video",
    name: "Video Walkthrough",
    description: "Cinematic walkthrough video, edited with music. Starting price — larger properties may cost more.",
    extraMinutes: 30,
    price: 150,
  },
];

export function getProduct(id) {
  return PRODUCTS.find((p) => p.id === id) || null;
}

export function getAddon(id) {
  return ADDONS.find((a) => a.id === id) || null;
}

export function computeDuration(productId, addonIds = []) {
  const product = getProduct(productId);
  if (!product) return 0;
  const extra = addonIds.reduce((sum, id) => {
    const a = getAddon(id);
    return sum + (a ? a.extraMinutes : 0);
  }, 0);
  return product.durationMinutes + extra;
}

export function computePrice(productId, addonIds = []) {
  const product = getProduct(productId);
  if (!product) return 0;
  const extra = addonIds.reduce((sum, id) => {
    const a = getAddon(id);
    return sum + (a ? a.price : 0);
  }, 0);
  return product.price + extra;
}
