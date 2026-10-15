import "server-only";

/**
 * Sends a plain-text email via Resend (https://resend.com) when RESEND_API_KEY
 * is set. Without a key the message is written to the server log, which is
 * enough for local development.
 */
export async function sendMail({ to, subject, text }: { to: string; subject: string; text: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info(`[mail] to=${to} subject=${subject}\n${text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "HiveVoice <noreply@example.org>", to, subject, text }),
  });
  if (!res.ok) throw new Error("mail_failed");
}
