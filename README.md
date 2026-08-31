# Yellow Cardinal Media — Booking

Client-facing scheduling app: pick package(s), pick add-ons, pick a time, book.
Every booking creates a real event on **your** Google Calendar and Google
automatically emails the client a calendar invite, plus a direct alert
email to you.

No database. Your Google Calendar is the source of truth for availability
and for bookings. Edit `lib/config.js` to change packages, add-ons, prices,
and business hours.

## 1. Get the code running locally

```bash
npm install
npm run dev
```

## 2. Create Google OAuth credentials

1. [Google Cloud Console](https://console.cloud.google.com/) → create/select your project.
2. **APIs & Services → Library** → enable **Google Calendar API**, **Google Sheets API**, **Gmail API**.
3. **APIs & Services → OAuth consent screen** (may show as "Google Auth Platform" → Audience/Clients in newer layouts): User type External, add your own Gmail as a test user.
4. **Credentials → Create Credentials → OAuth client ID** → Web application → add redirect URIs for local (`http://localhost:3000/api/auth/google/callback`) and production.
5. Copy the **Client ID** and **Client Secret**.

## 3. Set environment variables

Copy `.env.example` to `.env.local`, fill in `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`. Leave `GOOGLE_REFRESH_TOKEN` blank for now.

## 4. Connect your calendar

Visit **`/api/auth/google`**, sign in, approve access, copy the refresh
token shown into `GOOGLE_REFRESH_TOKEN`. One-time step. If you ever add a
new scope to the code, redo this step — the old token won't pick up new
permissions automatically.

## 5. Customize your business

Edit `lib/config.js`: `PRODUCTS`, `ADDONS`, `BUSINESS.hours`, `BUSINESS.timezone`,
`BUSINESS.notifyEmails`, `BUSINESS.requiredFreeCalendars`, `BUSINESS.originAddress`
and the distance rules.

## 6. Deploy

```bash
npm install -g vercel
vercel
```

Add all env vars in Vercel → Settings → Environment Variables, redeploy.
Point your domain under Settings → Domains.

## How a booking works, end to end

1. Client picks package(s) + add-ons (can combine packages).
2. Client enters property address, contact info, and property access method.
3. App checks your calendar, Kato's calendar, and distance rules — shows open slots.
4. Client picks a time and confirms.
5. Event is created (client + notifyEmails as attendees), alert email sent to you, booking logged to Sheet, cancel link embedded in the event.

## 7. Log bookings to a Sheet — plus a direct alert email

1. Enable **Google Sheets API**.
2. Create a Sheet, name the first tab `Bookings`, header row: `Timestamp | Property | Client | Email | Phone | Package | Add-ons | Price | Shoot Time | Access`.
3. Copy the spreadsheet ID from the URL into `SHEETS_SPREADSHEET_ID`.
4. Reconnect via `/api/auth/google` (Gmail-send scope needed) and update `GOOGLE_REFRESH_TOKEN`.

Don't rely on Google Sheets' own "Notification rules" — unreliable in
practice. The app sends a direct alert email itself (to
`jeff@yellowcardinalmedia.com`, hardcoded in `app/api/book/route.js`) using
the same connected account.

## 8. Embed on Squarespace

**Full-page embed:**
```html
<iframe src="https://booking.yellowcardinalmedia.com" style="width:100%;height:900px;border:0;" title="Book a shoot"></iframe>
```

**Modal popup** — Squarespace → Settings → Advanced → Code Injection → Footer:
```html
<div id="ss-booking-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center;">
  <div style="position:relative;width:95%;max-width:480px;height:85vh;background:#fff;border-radius:12px;overflow:hidden;">
    <button onclick="document.getElementById('ss-booking-overlay').style.display='none'" style="position:absolute;top:10px;right:10px;z-index:2;background:#fff;border:1px solid #ddd;border-radius:50%;width:32px;height:32px;">×</button>
    <iframe src="https://booking.yellowcardinalmedia.com" style="width:100%;height:100%;border:0;" title="Book a shoot"></iframe>
  </div>
</div>
<script>
  document.addEventListener('click', function(e) {
    if (e.target.closest('.open-booking-modal')) {
      document.getElementById('ss-booking-overlay').style.display = 'flex';
    }
  });
</script>
```
Give any button/link the CSS class `open-booking-modal` to trigger it.

## How availability actually works

Your entire business-hours window is bookable by default; anything already
on your calendar blocks that time automatically. No "open slot" events needed.

## Drive-time buffering and closing time

Gaps between bookings use real drive time (Distance Matrix API) + a
10-minute pad when `GOOGLE_MAPS_API_KEY` is set; falls back to
`BUSINESS.bufferMinutesBetweenShoots` otherwise. Closing time is the last
allowed **start** time (not a hard finish deadline) unless `strictCloseDistanceMiles`
applies.

## Address autocomplete

1. Enable **Places API**.
2. Create a **second, separate** API key (browser-facing).
3. **Application restrictions → Websites** → add your domain **including the `https://` scheme**, e.g. `https://booking.yellowcardinalmedia.com/*` — a missing scheme causes silent 403 errors.
4. **API restrictions** → limit to Places API only.
5. Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, redeploy.

Uses Google's current Autocomplete Suggestion API (the older `Autocomplete`
widget is blocked for any key created after March 2025) via the official
dynamic-library bootstrap loader — a plain `<script src="...">` tag alone
does not define `google.maps.importLibrary`.

## Check Kato's calendar too

Kato: Google Calendar → Settings → his calendar → "Share with specific
people or groups" → add your connected Gmail → permission "See only
free/busy." If not yet shared, the app just checks your own calendar
instead of erroring.

## Distance-based rules

All measured by real driving distance via `GOOGLE_MAPS_API_KEY`; unenforced if that key's missing.

- **`strictCloseDistanceMiles`** (default 45, from `originAddress`): no run-past-closing exception for far properties.
- **`tripChargeDistanceMiles`** (default 50, from `originAddress`): flat `tripChargeAmount` ($30) added automatically.
- **`maxSameDayDistanceMiles`** (default 40, between the new property and any OTHER shoot already booked that day): excludes the whole day rather than just adding a bigger time buffer.

## Cancelling a booking

Every event description includes a cancel link (`/cancel/[id]`) — no
login needed. Cancelling deletes the event with `sendUpdates: "all"`,
notifying everyone and freeing every calendar involved automatically.
The link's random ID is its only access control — reasonable for this
use case, not a full auth system.

## Things worth doing next (not included yet)

- Payments (Stripe Checkout)
- SMS reminders (Twilio)
- Reschedule (currently cancel + rebook only)
- Multiple photographers with per-photographer calendars
