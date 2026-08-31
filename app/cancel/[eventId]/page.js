"use client";

import { useEffect, useState } from "react";

export default function CancelPage({ params }) {
  const { eventId } = params;
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/cancel/${eventId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else if (data.cancelled) setDone(true);
        else setBooking(data);
      })
      .catch(() => setError("Couldn't load this booking."));
  }, [eventId]);

  async function confirmCancel() {
    setCancelling(true);
    try {
      const res = await fetch(`/api/cancel/${eventId}`, { method: "POST" });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setDone(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setCancelling(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-paper">
      <div className="max-w-md w-full text-center">
        <p className="font-mono text-xs tracking-widest text-brass uppercase mb-4">Yellow Cardinal Media</p>

        {error && <p className="text-rust text-sm">{error}</p>}

        {!error && done && (
          <>
            <h1 className="font-display text-3xl mb-3 text-ink">Booking cancelled</h1>
            <p className="text-slate text-sm">
              That time slot is now open again. If this was a mistake, just head back to the booking site to rebook.
            </p>
          </>
        )}

        {!error && !done && !booking && <p className="text-slate text-sm">Loading…</p>}

        {!error && !done && booking && (
          <>
            <h1 className="font-display text-3xl mb-3 text-ink">Cancel this booking?</h1>
            <p className="text-slate text-sm mb-1">{booking.summary}</p>
            <p className="font-mono text-sm text-ink/60 mb-6">{booking.when}</p>
            <button
              onClick={confirmCancel}
              disabled={cancelling}
              className="focus-ring bg-rust text-paper px-6 py-3 rounded-full disabled:opacity-40 text-sm"
            >
              {cancelling ? "Cancelling…" : "Yes, cancel this booking"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
