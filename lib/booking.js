import { BUSINESS } from "./config";

export const ACCESS_LABELS = {
  lockbox: "Lockbox",
  meet: "Meeting someone on-site",
  code: "Door code / smart lock",
  agent: "Agent will unlock remotely",
  vacant: "Vacant, unlocked",
  other: "Other",
};

export function formatWhen(startISO) {
  return new Date(startISO).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: BUSINESS.timezone,
  });
}

export function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL || "https://yellow-cardinal-booking.vercel.app";
}

// The shoot details, written once and reused in the pending event, the
// approval email, the approval page and the final confirmed event — so the
// four can never drift apart.
export function buildDetailLines({
  productNames,
  addonNames,
  tripCharge,
  distanceMiles,
  price,
  propertyAddress,
  accessLine,
  clientName,
  clientEmail,
  clientPhone,
  notes,
}) {
  return [
    `Packages: ${productNames.join(", ")}`,
    addonNames.length ? `Add-ons: ${addonNames.join(", ")}` : null,
    tripCharge ? `Trip charge: $${tripCharge} (${distanceMiles.toFixed(1)} mi from base)` : null,
    `Estimated total: $${price}`,
    `Property: ${propertyAddress}`,
    `Access: ${accessLine}`,
    `Client: ${clientName}`,
    `Client email: ${clientEmail}`,
    `Client phone: ${clientPhone || "n/a"}`,
    notes ? `Notes: ${notes}` : null,
  ].filter(Boolean);
}
