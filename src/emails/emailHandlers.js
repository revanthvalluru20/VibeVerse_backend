import { emailService } from "../services/emailService.js";

export const sendWelcomeEmail = async (email, name) => {
  return emailService.sendWelcomeEmail(email, name);
};
