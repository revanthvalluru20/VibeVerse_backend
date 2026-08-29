import { ENV } from "./env.js";

/**
 * Brevo HTTPS Client Configuration
 */
export const brevoConfig = {
  apiKey: ENV.BREVO_API_KEY || "",
  sender: {
    email: ENV.EMAIL_FROM || "vibeverse.verify@gmail.com",
    name: ENV.EMAIL_FROM_NAME || "VibeVerse",
  },
};
