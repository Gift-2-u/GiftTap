/**
 * Cloudflare Turnstile server verify.
 * Set TURNSTILE_SECRET_KEY in Supabase secrets.
 * If unset, verification is skipped (dev only) — set the secret in production.
 */

export async function verifyTurnstileToken(
  token: string | null | undefined,
  remoteIp?: string | null,
): Promise<void> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY") || "";
  if (!secret) {
    // Dev bypass — never ship production without this secret
    console.warn("TURNSTILE_SECRET_KEY unset — captcha not verified");
    return;
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
