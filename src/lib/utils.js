import jwt from "jsonwebtoken";
import { ENV } from "./env.js";

export const generateToken = (userId, res) => {
  const { JWT_SECRET } = ENV;
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  const token = jwt.sign({ userId }, JWT_SECRET, {
    expiresIn: "7d",
  });

  const isProduction = process.env.NODE_ENV === "production" || ENV.NODE_ENV === "production";
  const sameSite = process.env.COOKIE_SAME_SITE || ENV.COOKIE_SAME_SITE || (isProduction ? "none" : "lax");

  res.cookie("jwt", token, {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    httpOnly: true, // prevent XSS attacks
    sameSite: sameSite, // "none" in cross-origin production (e.g. Vercel frontend + Render backend)
    secure: isProduction, // HTTPS required in production (mandatory when sameSite is "none")
    path: "/",
  });

  return token;
};
