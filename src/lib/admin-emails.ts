/** Who runs this server: ADMIN_EMAILS at the hosting provider, comma separated. */
export function adminEmails() {
  return (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}
