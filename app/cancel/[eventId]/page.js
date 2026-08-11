"use client";

import { useEffect, useState } from "react";

export default function CancelPage({ params }) {
  const { eventId } = params;
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState(null); // null | "cancel" | "reschedule"
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(null); // null | "cancel" | "reschedule"

  useEffect(() => {
    fetch(`/api/cancel/${eventId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else if (data.cancelled) setDone("cancel");
        else setBooking(data);
      })
      .catch(() => setError("Couldn't load this booking."));
  }, [eventId]);

  async function submit(action) {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/cancel/${eventId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, note }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setDone(action);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-paper">
      <div className="max-w-md w-full text-center">
        <p className="font-mono text-xs tracking-widest text-brass uppercase mb-4">Yellow Cardinal Media</p>

        {error && <p className="text-rust text-sm">{error}</p>}

        {!error && done === "cancel" && (
          <>
            <h1 className="font-display text-3xl mb-3 text-ink">Booking cancelled</h1>
            <p className="text-slate text-sm">
              That time slot is now open again, and we&apos;ve been notified. If this was a mistake, just head back to
              the booking site to rebook.
            </p>
          </>
        )}

        {!error && done === "reschedule" && (
          <>
            <h1 className="font-display text-3xl mb-3 text-ink">Request sent</h1>
            <p className="text-slate text-sm">
              We&apos;ve got your reschedule request and will be in touch shortly to sort out a new time. Your original
              slot is still held for now, so nothing is lost.
            </p>
          </>
        )}

        {!error && !done && !booking && <p className="text-slate text-sm">Loading…</p>}

        {!error && !done && booking && (
          <>
            <h1 className="font-display text-3xl mb-3 text-ink">
              {mode === "cancel" ? "Cancel this booking?" : mode === "reschedule" ? "Request a new time" : "Manage your booking"}
            </h1>
            <p className="text-slate text-sm mb-1">{booking.summary}</p>
            <p className="font-mono text-sm text-ink/60 mb-6">{booking.when}</p>

            {!mode && (
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setMode("reschedule")}
                  className="focus-ring bg-ink text-paper px-6 py-3 rounded-full text-sm"
                >
                  Request a different time
                </button>
                <button
                  onClick={() => setMode("cancel")}
                  className="focus-ring border border-rust text-rust px-6 py-3 rounded-full text-sm"
                >
                  Cancel this booking
                </button>
              </div>
            )}

            {mode && (
              <>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder={
                    mode === "reschedule"
                      ? "What days or times work better for you? (optional)"
                      : "Anything you'd like us to know? (optional)"
                  }
                  className="focus-ring w-full border border-ink/15 rounded-2xl px-4 py-3 text-sm mb-4 bg-paper text-ink"
                />
                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => submit(mode)}
                    disabled={submitting}
                    className={`focus-ring px-6 py-3 rounded-full disabled:opacity-40 text-sm ${
                      mode === "cancel" ? "bg-rust text-paper" : "bg-ink text-paper"
                    }`}
                  >
                    {submitting
                      ? "Sending…"
                      : mode === "cancel"
                      ? "Yes, cancel this booking"
                      : "Send reschedule request"}
                  </button>
                  <button
                    onClick={() => {
                      setMode(null);
                      setNote("");
                    }}
                    disabled={submitting}
                    className="focus-ring text-slate text-sm underline disabled:opacity-40"
                  >
                    Back
                  </button>
                </div>
                {mode === "reschedule" && (
                  <p className="text-slate text-xs mt-4">
                    This doesn&apos;t cancel anything — your current time stays booked until we agree a new one.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
