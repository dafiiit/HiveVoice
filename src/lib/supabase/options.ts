// One place for how the login cookie behaves: it lives for more than a year, so people
// stay signed in on their device, and it is only sent over https in production.
export const cookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 400,
  secure: process.env.NODE_ENV === "production",
};
