# Yellow Cardinal Media — Booking

Client-facing scheduling app: pick a package, pick add-ons, pick a time, book.
Every booking creates a real event on **your** Google Calendar and Google
automatically emails the client a calendar invite (that's the "notification"
— no separate email service needed).

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
2. **APIs & Services → Library** → enable **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**:
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

## 5. Customize your business

Edit `lib/config.js`:
- `PRODUCTS` — your packages, durations, prices
- `ADDONS` — drone, video, 3D tour, floor plan, etc.
- `BUSINESS.hours` — your working hours per day of week
- `BUSINESS.timezone` — defaults to `America/Chicago`
- `BUSINESS.bufferMinutesBetweenShoots` — drive time between listings

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

Point your domain (e.g. `booking.yellowcardinalmedia.com`) at the Vercel project
under Settings → Domains.

## How a booking works, end to end

1. Client opens the site, picks a package + add-ons.
2. Client picks a date; the app calls Google's free/busy API for your
   calendar and only shows open slots (respecting your business hours,
   buffer time, and existing events).
3. Client enters their info and confirms.
4. The app creates a Google Calendar event on your calendar with the
   client as an attendee — Google sends them the invite email
   automatically, and it shows up on your calendar with the property
   address, package, and add-ons in the description.

## 7. Log bookings to a Sheet — plus a direct alert email

Calendar events are already the source of truth, but a running list is
useful for your own records.

1. Enable the **Google Sheets API** in the same Google Cloud project (APIs & Services → Library → search "Google Sheets API" → Enable).
2. Create a new Google Sheet, name the first tab `Bookings`, and add a header row: `Timestamp | Property | Client | Email | Phone | Package | Add-ons | Price | Shoot Time`.
3. Copy the spreadsheet ID from its URL (`docs.google.com/spreadsheets/d/`**`THIS_PART`**`/edit`) into `SHEETS_SPREADSHEET_ID`.
4. Reconnect: visit `/api/auth/google` again (a Gmail-send scope was added to the code, see below) and update `GOOGLE_REFRESH_TOKEN` with the new token.

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
- Add a **Code Block** on the page → paste:
```html
<iframe src="https://booking.yellowcardinalmedia.com" style="width:100%;height:900px;border:0;" title="Book a shoot"></iframe>
```

**B. Modal popup** — a "Book a shoot" button anywhere on your site opens the scheduler as an overlay, like the preview above:
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
2. On any button/text link in the Squarespace editor, give it the CSS class `open-booking-modal` (Squarespace lets you set custom classes on most block/button settings under "Custom CSS Class"). Clicking it now pops the scheduler open as a modal, exactly like the preview.

Swap `booking.yellowcardinalmedia.com` for your real deployed URL in both snippets.

## How availability actually works

You never create "open slot" events. Your entire business-hours window
(`BUSINESS.hours` in `lib/config.js`) is treated as bookable by default —
anything already on your calendar (another shoot, a dentist appointment,
anything) blocks that time automatically. Want to block off a chunk of a
day with nothing scheduled? Just add a normal calendar event for it.

## Drive-time buffering between shoots

By default, back-to-back bookings only get a flat 30-minute gap
(`BUSINESS.bufferMinutesBetweenShoots` in `lib/config.js`) — fine for
shoots in the same neighborhood, not enough if the next one is 45 minutes
away.

To make the buffer distance-aware:

1. Google Cloud Console → APIs & Services → Library → enable **Distance Matrix API**.
2. Credentials → Create Credentials → **API key**. Restrict it to the Distance Matrix API for safety.
3. Set `GOOGLE_MAPS_API_KEY` in your environment.

Once set, every time a client picks a date, the app looks at the shoots
already booked that day, gets the real drive time between each property
and the new one, and only opens up slots that leave enough room to
actually get there (drive time + a 10-minute pad). A shoot 2 hours away
won't be offered a slot right after one that just ended; a shoot 5
minutes away can be booked much tighter.

If `GOOGLE_MAPS_API_KEY` isn't set, or an address can't be geocoded, it
falls back to the flat buffer for that gap — nothing breaks, it's just
less precise.

Note: this only accounts for drive time *between shoots on the same
day* — it doesn't currently account for your own starting location
before the first shoot of the day. If that matters, set your business
hours' start time later to build in that first commute.

## Address autocomplete

Same Google Maps platform as drive-time buffering, one more API to enable:

1. Google Cloud Console → APIs & Services → Library → enable **Places API**.
2. Credentials → Create Credentials → **API key** (a *second*, separate key from the drive-time one, since this one runs in the customer's browser and needs to be restricted differently).
3. Click into the new key → under "Application restrictions" choose **Websites** → add your live domain (e.g. `https://booking.yellowcardinalmedia.com/*`). This stops anyone else from using your key on their own site.
4. Under "API restrictions" limit it to **Places API** only.
5. Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` to that key's value and redeploy.

Once set, the property address field shows a live dropdown of suggestions
as you type (Google's current Autocomplete Suggestion API — not the older
widget, which Google blocks for any API key created after March 2025).
Without this env var set, it's just a plain text field and everything
else still works.

## Check Kato's calendar too

Every booking now requires both you and Kato to be free — a slot won't be
offered unless neither of you has a conflict. This needs one thing from
Kato (no new API setup on your end, same Google credentials you already
have):

1. Kato opens **Google Calendar → Settings** (gear icon) → clicks on his
   calendar under "Settings for my calendars" in the left sidebar.
2. Under **"Share with specific people or groups"** → **Add people** →
   enters your connected Gmail (`jeff@yellowcardinalmedia.com` or
   whichever account you connected in step 4 above).
3. Permission level: **"See only free/busy (hide details)"** is enough —
   he doesn't need to share what the events actually are, just when he's
   busy.
4. Save.

That's it — nothing to redeploy, no new key. Your app checks his free/busy
status live on every availability search. If he hasn't shared it yet
(or shares it later and it hasn't propagated), the app quietly falls back
to just checking your own calendar rather than erroring out — so the
site keeps working either way, it just won't factor in his schedule
until he shares it.

To add or remove people from this requirement later, edit
`requiredFreeCalendars` in `lib/config.js`.

## Distance-based rules

Both rules measure real driving distance from your home base
(`BUSINESS.originAddress` in `lib/config.js`) to the property, using the
same Google Maps key as drive-time buffering (`GOOGLE_MAPS_API_KEY`) — no
extra setup if that's already configured. If the key isn't set, neither
rule is enforced.

- **Farther than `strictCloseDistanceMiles` (default 45 mi)**: the shoot
  can't be booked with a start time that would run past closing. Closer
  properties get the normal exception (can start right at closing and run
  over); far ones can't — the whole shoot must fit within business hours.
- **Farther than `tripChargeDistanceMiles` (default 50 mi)**: a flat
  `tripChargeAmount` ($30 default) is added to the total automatically.
  It shows up to the client before they confirm, and is baked into the
  calendar event description, the Sheet log, and the final price — not
  something you have to remember to add manually.

Both thresholds and the charge amount are editable in `lib/config.js`.

## Things worth doing next (not included yet)

- **Payments**: add Stripe Checkout before the final confirm step if you
  want deposits or full payment up front.
- **SMS reminders**: Twilio is a common add-on once this is live.
- **Cancellation/reschedule links**: currently clients would email/call you;
  a self-serve cancel link is a natural next feature.
- **Multiple photographers**: this version assumes one calendar/one
  shooter; a team version would need a calendar per photographer.
