import { ENV } from "../lib/env.js";

/**
 * VibeVerse Email Service powered by Brevo Transactional Email API (HTTPS).
 *
 * Sends emails via HTTPS POST to https://api.brevo.com/v3/smtp/email (Port 443).
 * This completely avoids SMTP port 587/465 blocking and timeouts on cloud
 * hosts like Render, and allows sending to ANY user email on Brevo's free plan.
 */

export class EmailDeliveryError extends Error {
  constructor(message = "Failed to send email") {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

const isProduction = () => (process.env.NODE_ENV || ENV.NODE_ENV) === "production";

const getApiKey = () => {
  return (ENV.BREVO_API_KEY || process.env.BREVO_API_KEY || "").trim();
};

/**
 * Extracts clean name and email from EMAIL_FROM and EMAIL_FROM_NAME
 */
const getSenderInfo = () => {
  const rawFrom = (ENV.EMAIL_FROM || process.env.EMAIL_FROM || "").trim();
  const rawName = (ENV.EMAIL_FROM_NAME || process.env.EMAIL_FROM_NAME || "VibeVerse").trim();

  // If format is "VibeVerse <user@domain.com>"
  const match = rawFrom.match(/^(?:([^<]+)<)?([^>]+)>?$/);
  if (match) {
    const extractedName = (match[1] || "").trim();
    const extractedEmail = (match[2] || "").trim();
    return {
      name: extractedName || rawName || "VibeVerse",
      email: extractedEmail || "vibeverse.verify@gmail.com",
    };
  }

  return {
    name: rawName || "VibeVerse",
    email: rawFrom || "vibeverse.verify@gmail.com",
  };
};

const logDevEmail = (label, { to, subject, text }) => {
  if (isProduction()) return;
  console.log(`\n========================================`);
  console.log(`[DEV MODE - ${label}]`);
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Text: ${text}`);
  console.log(`========================================\n`);
};

/**
 * Sends an email via Brevo's Transactional Email HTTPS API.
 */
const sendMail = async ({ to, subject, html, text, recipientName }) => {
  const apiKey = getApiKey();
  const sender = getSenderInfo();

  if (!apiKey) {
    if (isProduction()) {
      console.error(
        `[EmailService] BREVO_API_KEY is not configured in production environment. Cannot send email to ${to}.`
      );
      throw new EmailDeliveryError("Email service is not configured");
    }

    // Local development fallback when no API key is set
    logDevEmail("NO BREVO_API_KEY CONFIGURED", { to, subject, text });
    return { messageId: "dev-mock-id", success: true };
  }

  const payload = {
    sender: {
      name: sender.name,
      email: sender.email,
    },
    to: [
      {
        email: to,
        ...(recipientName ? { name: recipientName } : {}),
      },
    ],
    subject,
    htmlContent: html,
    textContent: text,
  };

  try {
    const response = await fetch(BREVO_API_URL, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error(`[EmailService] Brevo API returned HTTP ${response.status} for ${to}:`, {
        code: responseData?.code,
        message: responseData?.message,
      });

      if (isProduction()) {
        throw new EmailDeliveryError("Failed to send email");
      }

      logDevEmail("FALLBACK AFTER BREVO API ERROR", { to, subject, text });
      return null;
    }

    if (!isProduction()) {
      console.log(
        `[EmailService] Email sent successfully via Brevo to ${to} (MessageId: ${responseData?.messageId || "ok"})`
      );
    } else {
      console.log(`[EmailService] Email dispatched to ${to}`);
    }

    return responseData;
  } catch (err) {
    if (err instanceof EmailDeliveryError) throw err;

    console.error(`[EmailService] Unexpected network error sending email via Brevo to ${to}:`, err?.message || err);
    if (isProduction()) {
      throw new EmailDeliveryError("Failed to send email");
    }

    logDevEmail("FALLBACK AFTER UNEXPECTED NETWORK ERROR", { to, subject, text });
    return null;
  }
};

const getOtpTemplate = (title, name, otp, description) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #061224; color: #f8fafc; margin: 0; padding: 20px; }
    .container { max-width: 500px; margin: 0 auto; background: #0a192f; border-radius: 16px; border: 1px solid #162f55; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .logo { text-align: center; font-size: 26px; font-weight: 800; color: #ffffff; margin-bottom: 24px; letter-spacing: 0.5px; }
    .logo span { display: inline-block; background: linear-gradient(135deg, #0a192f, #1e3a68); color: #fff; padding: 4px 10px; border-radius: 8px; margin-right: 8px; border: 1px solid #3b82f6; }
    .title { font-size: 20px; font-weight: 700; color: #ffffff; margin-bottom: 12px; text-align: center; }
    .desc { font-size: 14px; color: #94a3b8; text-align: center; line-height: 1.6; margin-bottom: 24px; }
    .otp-box { background: linear-gradient(135deg, #0f2744, #1b3a60); border-radius: 12px; padding: 18px; text-align: center; letter-spacing: 10px; font-size: 32px; font-weight: 800; color: #ffffff; margin: 24px 0; border: 1px solid #2b4c7e; }
    .footer { font-size: 12px; color: #64748b; text-align: center; margin-top: 32px; border-top: 1px solid #162f55; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo"><span>V</span> VibeVerse</div>
    <div class="title">${title}</div>
    <div class="desc">Hello ${name || "User"},<br>${description}</div>
    <div class="otp-box">${otp}</div>
    <div class="desc">This OTP code is valid for <strong>10 minutes</strong>. Do not share this code with anyone.</div>
    <div class="footer">&copy; ${new Date().getFullYear()} VibeVerse. All rights reserved.</div>
  </div>
</body>
</html>
`;

export const emailService = {
  /**
   * Generic OTP sender
   */
  sendOTPEmail: async (to, otp, name = "there") => {
    const subject = `${otp} is your VibeVerse verification code`;
    const text = `Hello ${name}, your VibeVerse verification code is: ${otp}. It expires in 10 minutes.`;
    const html = getOtpTemplate(
      "Verification Code",
      name,
      otp,
      "Please use the code below to complete your verification."
    );
    return sendMail({ to, subject, html, text, recipientName: name });
  },

  sendRegistrationOtp: async (email, otp, name) => {
    const subject = `${otp} is your VibeVerse verification code`;
    const text = `Hello ${name || "there"}, your VibeVerse registration verification code is: ${otp}. It expires in 10 minutes.`;
    const html = getOtpTemplate(
      "Email Verification",
      name,
      otp,
      "Please use the code below to verify your email address and complete your VibeVerse registration."
    );
    return sendMail({ to: email, subject, html, text, recipientName: name });
  },

  sendForgotPasswordOtp: async (email, otp, name) => {
    const subject = `${otp} is your VibeVerse password reset code`;
    const text = `Hello, your VibeVerse password reset OTP code is: ${otp}. It expires in 10 minutes.`;
    const html = getOtpTemplate(
      "Password Reset Request",
      name,
      otp,
      "We received a request to reset your VibeVerse account password. Use the verification code below to set a new password."
    );
    return sendMail({ to: email, subject, html, text, recipientName: name });
  },

  sendChangePasswordOtp: async (email, otp, name) => {
    const subject = `${otp} is your VibeVerse change password code`;
    const text = `Hello, your VibeVerse change password verification code is: ${otp}. It expires in 10 minutes.`;
    const html = getOtpTemplate(
      "Change Password Verification",
      name,
      otp,
      "You requested to change your password from your account settings. Use the code below to confirm this change."
    );
    return sendMail({ to: email, subject, html, text, recipientName: name });
  },

  sendWelcomeEmail: async (email, name) => {
    const subject = "Welcome to VibeVerse!";
    const text = `Welcome to VibeVerse, ${name}! Your email address has been verified. You can now log in, chat in real-time, and play multiplayer games!`;
    const html = `
      <div style="font-family: Arial, sans-serif; background: #0a192f; color: #f8fafc; padding: 30px; text-align: center; border-radius: 12px;">
        <h1 style="color: #ffffff;">Welcome to VibeVerse! 💬🎮</h1>
        <p style="font-size: 16px; color: #cbd5e1;">Hi ${name}, your email is now verified!</p>
        <p style="font-size: 14px; color: #94a3b8;">Start direct messaging, group chatting, and playing interactive real-time games with your friends.</p>
      </div>
    `;
    return sendMail({ to: email, subject, html, text, recipientName: name });
  },
};
