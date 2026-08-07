interface TwilioLikeError {
  code?: number;
  status?: number;
  message?: string;
}

// Twilio errors (and similar REST errors) are huge Error objects with a full
// stack trace — console.error-ing them raw floods the log for conditions
// that are expected and already handled (rate limits, trial restrictions).
// This gives a one-line summary instead, with special-casing for the errors
// we actually expect to hit during dev/trial usage.
export function formatWhatsAppError(err: unknown): string {
  const e = err as TwilioLikeError;

  if (e?.code === 63038) {
    return 'Twilio trial account daily message limit (50/day) reached — message not sent. Upgrade the Twilio account or wait for the 24h window to reset.';
  }
  if (e?.code === 63007) {
    return "Twilio: sender/channel not found — the recipient likely hasn't joined the WhatsApp sandbox (or it expired after 72h of inactivity).";
  }
  if (typeof e?.code === 'number' && e?.message) {
    return `Twilio error ${e.code}${e.status ? ` (HTTP ${e.status})` : ''}: ${e.message}`;
  }
  return err instanceof Error ? err.message : String(err);
}
