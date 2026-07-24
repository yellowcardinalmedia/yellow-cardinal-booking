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
    1: { start: "09:30", end: "16:00" },
    2: { start: "09:30", end: "16:00" },
    3: { start: "09:30", end: "16:00" },
    4: { start: "09:30", end: "16:00" },
    5: { start: "09:30", end: "16:00" },
    6: { start: "09:30", end: "16:00" },
  },
  bufferMinutesBetweenShoots: 30,
  // Extra people who should get every booking's calendar invite, in addition
  // to the client. You (the connected Gmail) already see it since it's on
  // your own calendar — this is for anyone else, e.g. an assistant or partner.
  notifyEmails: [
    "jeff@yellowcardinalmedia.com",
    "kato@katobentleyphoto.com",
  ],
  // Other people who must ALSO be free for a slot to be offered — e.g. every
  // shoot needs Kato available too. Each person needs to share their Google
  // Calendar with your connected account (at least "See only free/busy" —
  // see README "Check Kato's calendar too" for exact steps).
  requiredFreeCalendars: [
    "kato@katobentleyphoto.com",
  ],
};

// Each product has a duration (minutes) — this drives slot length and availability math.
// Clients can select more than one (e.g. Photo + Video together) — durations and
// prices for all selected packages stack.
export const PRODUCTS = [
  {
    id: "mls",
    name: "MLS Photo Shoot",
    description: "Interior + exterior listing photos plus aerial/drone shots, included.",
    durationMinutes: 60,
    price: 195,
  },
  {
    id: "video",
    name: "Video Package",
    description: "Cinematic walkthrough video, edited with music. Starting price — larger properties may cost more.",
    durationMinutes: 45,
    price: 150,
  },
  {
    id: "drone",
    name: "Drone Only",
    description: "Aerial stills of the property and surrounding area, no interior photos.",
    durationMinutes: 30,
    price: 175,
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
];

export function getProduct(id) {
  return PRODUCTS.find((p) => p.id === id) || null;
}

export function getAddon(id) {
  return ADDONS.find((a) => a.id === id) || null;
}

export function computeDuration(productIds = [], addonIds = []) {
  const ids = Array.isArray(productIds) ? productIds : [productIds]; // accept a single id too, for safety
  const productMinutes = ids.reduce((sum, id) => {
    const p = getProduct(id);
    return sum + (p ? p.durationMinutes : 0);
  }, 0);
  const extra = addonIds.reduce((sum, id) => {
    const a = getAddon(id);
    return sum + (a ? a.extraMinutes : 0);
  }, 0);
  return productMinutes + extra;
}

export function computePrice(productIds = [], addonIds = []) {
  const ids = Array.isArray(productIds) ? productIds : [productIds];
  const productPrice = ids.reduce((sum, id) => {
    const p = getProduct(id);
    return sum + (p ? p.price : 0);
  }, 0);
  const extra = addonIds.reduce((sum, id) => {
    const a = getAddon(id);
    return sum + (a ? a.price : 0);
  }, 0);
  return productPrice + extra;
}
