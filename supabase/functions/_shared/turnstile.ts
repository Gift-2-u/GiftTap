/**
 * Cloudflare Turnstile server verify (siteverify).
 *
 * Required Supabase Edge secret:
 *   TURNSTILE_SECRET_KEY = Cloudflare widget *secret* key (0x… / long secret)
 * NOT VITE_TURNSTILE_SITE_KEY (that is public, frontend-only).
 *
 * If TURNSTILE_SECRET_KEY is missing, auth fails closed (no silent bypass).
 * Set TURNSTILE_OPTIONAL=1 only for emergency local debugging.
 *
 * Local Vite widget: add localhost + 127.0.0.1 under Turnstile Hostname Management.
 */

export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<void> {
  const secret = String(Deno.env.get("TURNSTILE_SECRET_KEY") || "").trim();
  const optional = Deno.env.get("TURNSTILE_OPTIONAL") === "1";

  if (!secret) {
    console.error(
      "TURNSTILE_SECRET_KEY unset — siteverify not called. Set the Cloudflare *secret* key in Supabase secrets (not the site key).",
    );
    if (optional) {
      console.warn("TURNSTILE_OPTIONAL=1 — captcha skipped");
      return;
    }
    throw new Error(
      "Captcha is misconfigured on the server (missing TURNSTILE_SECRET_KEY). Try again later.",
    );
  }

  if (secret.length < 20) {
    console.error("TURNSTILE_SECRET_KEY too short");
    throw new Error(
      "Captcha is misconfigured on the server (invalid secret). Try again later.",
    );
  }

  const t = String(token || "").trim();
  if (!t) {
    throw new Error("Complete the captcha to continue.");
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", t);
  if (remoteIp) body.set("remoteip", remoteIp);

  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!data?.success) {
    const codes = Array.isArray(data?.["error-codes"])
      ? data["error-codes"].join(", ")
      : "failed";
    throw new Error(`Captcha failed (${codes}). Try again.`);
  }
}
