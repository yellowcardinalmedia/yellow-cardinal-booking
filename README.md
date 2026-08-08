# Yellow Cardinal Media — Booking

Client-facing scheduling app: pick a package, pick add-ons, pick a time, book.
Every booking creates a real event on **your** Google Calendar and Google
automatically emails the client a calendar invite (that's the "notification"
— no separate email service needed), plus a direct alert email to you.

No database. Your Google Calendar is the source of truth for availability
(existing events block those times) and for bookings (each booking is just
a calendar event). Edit `lib/config.js` to change your packages, add-ons,
prices, and business hours.

## 1. Get the code running locally

```bash
npm install
npm run dev
```

Opens at http://localhost:3000 — but booking won't work yet until you
connect Google Calendar (step 2).

## 2. Create Google OAuth credentials

You only do this once, for your own business Gmail account.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → create a new project (any name, e.g. "Shotlist Booking").
2. **APIs & Services → Library** → enable **Google Calendar API**, **Google Sheets API**, and **Gmail API**.
3. **APIs & Services → OAuth consent screen** (may show as "Google Auth Platform" → Audience/Clients in newer Cloud Console layouts):
   - User type: External (unless you have Google Workspace, then Internal is fine).
   - Fill in app name, your email. Add your own Gmail under "Test users" while the app is unpublished — this is fine, you never need to publish it since only you (the business owner) will ever authorize it.
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized redirect URIs: add `http://localhost:3000/api/auth/google/callback` for local testing, and your production URL (e.g. `https://booking.yellowcardinalmedia.com/api/auth/google/callback`) once you deploy.
5. Copy the **Client ID** and **Client Secret**.

## 3. Set environment variables

Copy `.env.example` to `.env.local` and fill in `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` from step 2. Leave `GOOGLE_REFRESH_TOKEN` blank for now.

## 4. Connect your calendar

With the app running, visit **`/api/auth/google`** in your browser and sign
in with the Gmail account whose calendar you want bookings to land on.
Approve access. You'll land on a page showing a long token string —
copy it into `GOOGLE_REFRESH_TOKEN` in `.env.local` (or your host's env
var settings if deployed) and restart/redeploy.

This is a one-time step. After this, customers booking on your site never
see or touch Google at all — they just pick a time and get an email.

If you ever add a new permission scope to the code (Sheets, Gmail send,
etc.), you need to redo this step to get a refresh token that includes
the new scope — the old one won't automatically pick up new permissions.

## 5. Customize your business

Edit `lib/config.js`:
- `PRODUCTS` — your packages, durations, prices
- `ADDONS` — floor plan, custom home website, etc.
- `BUSINESS.hours` — your working hours per day of week
- `BUSINESS.timezone` — defaults to `America/Chicago`
- `BUSINESS.bufferMinutesBetweenShoots` — flat fallback buffer when drive time can't be calculated
- `BUSINESS.notifyEmails` — who gets a calendar invite copy of every booking
- `BUSINESS.requiredFreeCalendars` — who else must be free (e.g. Kato)
- `BUSINESS.originAddress` and the distance-based rules (see below)

## 6. Deploy (get it live)

Easiest path is [Vercel](https://vercel.com), free for this scale:

```bash
npm install -g vercel
vercel
```

Then in the Vercel project dashboard → Settings → Environment Variables,
add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
(your production callback URL), and `GOOGLE_REFRESH_TOKEN` (from step 4,
run against the production URL once it's deployed — you'll need to visit
`/api/auth/google` on the live domain to get a production refresh token,
and add that production redirect URI to the OAuth client in step 2).
Redeploy after adding env vars.

Point your domain (e.g. `booking.yellowcardinalmedia.com`) at the Vercel
project under Settings → Domains.

## How a booking works, end to end

1. Client opens the site, picks package(s) + add-ons (packages can be combined).
2. Client enters the property address, contact info, and how to access the
   property (lockbox, meet on-site, door code, etc.).
3. The app calls Google's calendar for your busy times (and Kato's, and
   checks distance rules) and only shows open slots.
4. Client picks a time and confirms.
5. The app creates a Google Calendar event on your calendar with the
   client (and anyone in `notifyEmails`) as attendees — Google sends
   them the invite email automatically. A direct alert email also goes
   to you. The booking is logged to your Sheet if configured. A cancel
   link is embedded in the event description.

## 7. Log bookings to a Sheet — plus a direct alert email

Calendar events are already the source of truth, but a running list is
useful for your own records.

1. Enable the **Google Sheets API** in the same Google Cloud project (APIs & Services → Library → search "Google Sheets API" → Enable).
2. Create a new Google Sheet, name the first tab `Bookings`, and add a header row: `Timestamp | Property | Client | Email | Phone | Package | Add-ons | Price | Shoot Time | Access`.
3. Copy the spreadsheet ID from its URL (`docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`) into `SHEETS_SPREADSHEET_ID`.
4. Reconnect: visit `/api/auth/google` again (a Gmail-send scope was added to the code) and update `GOOGLE_REFRESH_TOKEN` with the new token.

For getting notified the moment a booking lands, don't rely on Google
Sheets' own "Notification rules" feature — in practice it's unreliable
even when configured exactly right. Instead, the app sends a plain
alert email directly (to `jeff@yellowcardinalmedia.com`, hardcoded in
`app/api/book/route.js` — change it there if that address ever changes),
using the same connected Google account, no third-party email service
needed. This only needs the reconnect in step 4 above (adds Gmail-send
permission) — nothing else to configure.

## 8. Embed on Squarespace

Squarespace can't run this app itself (it needs a real backend for the
Google Calendar calls), but it can embed the deployed version. Two options:

**A. Full-page embed** — simplest, good if booking has its own page/URL on your site:
```html
<iframe src="https://booking.yellowcardinalmedia.com" style="width:100%;height:900px;border:0;" title="Book a shoot"></iframe>
```

**B. Modal popup** — a "Book a shoot" button anywhere on your site opens the scheduler as an overlay:
1. Squarespace → Settings → Advanced → Code Injection → paste into **Footer**:
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
2. On any button/text link in the Squarespace editor, give it the CSS class `open-booking-modal`.

Swap `booking.yellowcardinalmedia.com` for your real deployed URL in both snippets.

## How availability actually works

You never create "open slot" events. Your entire business-hours window
(`BUSINESS.hours` in `lib/config.js`) is treated as bookable by default —
anything already on your calendar (another shoot, a dentist appointment,
anything) blocks that time automatically. Want to block off a chunk of a
day with nothing scheduled? Just add a normal calendar event for it.

## Drive-time buffering between shoots

The gap between back-to-back bookings is real drive time (Google's
Distance Matrix API) plus a 10-minute pad — not a flat number — when
`GOOGLE_MAPS_API_KEY` is set. Falls back to `BUSINESS.bufferMinutesBetweenShoots`
otherwise.

The closing hour (`BUSINESS.hours[...].end`) is the last allowed **start**
time, not a hard finish deadline — a shoot booked right at close is
allowed to run past it, unless the property is far enough away to trigger
`strictCloseDistanceMiles` (see below), in which case it must fully finish
by closing time instead.

Note: same-day-only — it doesn't currently account for your own starting
location before the first shoot of the day.

## Address autocomplete

Same Google Maps platform as drive-time buffering, one more API to enable:

1. Google Cloud Console → APIs & Services → Library → enable **Places API**.
2. Credentials → Create Credentials → **API key** (a *second*, separate key from the drive-time one, since this one runs in the customer's browser).
3. Click into the new key → **Application restrictions** → **Websites** → add your live domain (e.g. `https://booking.yellowcardinalmedia.com/*`).
4. **API restrictions** → limit to **Places API** only.
5. Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to that key's value and redeploy.

Once set, the property address field shows a live dropdown of suggestions
as you type (Google's current Autocomplete Suggestion API — not the older
widget, which Google blocks for any API key created after March 2025).

## Check Kato's calendar too

Every booking requires both you and Kato to be free. This needs one
thing from Kato (no new API setup on your end):

1. Kato opens **Google Calendar → Settings** → clicks on his calendar
   under "Settings for my calendars."
2. **"Share with specific people or groups"** → **Add people** → enters
   your connected Gmail.
3. Permission level: **"See only free/busy (hide details)"** is enough.
4. Save.

If he hasn't shared it yet, the app quietly falls back to just checking
your own calendar rather than erroring out. Edit `requiredFreeCalendars`
in `lib/config.js` to add/remove people.

## Distance-based rules

All measured by real driving distance, using `GOOGLE_MAPS_API_KEY`. If
that key isn't set, none of these are enforced.

- **`strictCloseDistanceMiles`** (default 45, measured from `originAddress`): properties farther than this can't book a shoot that would run past closing — the whole thing must fit within business hours, no exception.
- **`tripChargeDistanceMiles`** (default 50, measured from `originAddress`): a flat `tripChargeAmount` ($30 default) gets added automatically — shown to the client before they confirm, baked into the event, Sheet log, and final price.
- **`maxSameDayDistanceMiles`** (default 40, measured between the new property and every OTHER shoot already booked that same day — not from `originAddress`): if any existing shoot that day is farther than this from the new address, the entire day is excluded from availability. This is separate from drive-time buffering — buffering just spaces shoots out in time; this rule refuses same-day scheduling entirely past this distance, so the client has to pick a different day rather than the app trying to squeeze in a long cross-town drive with just a bigger time gap.

All thresholds and amounts are editable in `lib/config.js`.

## Cancelling a booking

Every booking's calendar event description includes a cancel link
(`/cancel/[id]`) — the client can click it (from the calendar invite or
anywhere they have the link) to see the booking details and cancel it
themselves, no account or login needed. Cancelling deletes the calendar
event with `sendUpdates: "all"`, which notifies everyone (client, you,
Kato) and automatically frees up that time slot on every calendar
involved — nothing else to do manually. You (or Kato) can also just
open the event in Google Calendar directly and delete it the normal
way; that has the same effect.

The link uses a random, hard-to-guess event ID as its only "access
control" — there's no password or login. That's an intentional
trade-off for simplicity; anyone with the exact link can cancel that
one booking, but the ID isn't discoverable or guessable.

## Things worth doing next (not included yet)

- **Payments**: add Stripe Checkout before the final confirm step if you
  want deposits or full payment up front.
- **SMS reminders**: Twilio is a common add-on once this is live.
- **Reschedule** (not just cancel): currently a client who wants a
  different time has to cancel and rebook from scratch.
- **Multiple photographers**: this version assumes one calendar/one
  shooter (plus Kato as a required-free check) — a full team version
  would need a calendar per photographer and an assignment step.
