import nodemailer from "nodemailer";
import dns from "dns";
import { ENV } from "../lib/env.js";

/*
 * Email Service with Dual-Stack (IPv4 & IPv6) Support.
 *
 * SMTP_HOST (e.g. smtp.gmail.com) publishes both IPv4 (A) and IPv6 (AAAA) records.
 * We resolve and pool both IPv4 and IPv6 addresses with intelligent failover.
 * The transport dials resolved IPv4 and IPv6 addresses with servername="smtp.gmail.com"
 * so TLS SNI validation against the certificate remains fully secure and strict.
 */

const SMTP_HOST = "smtp.gmail.com";
const SMTP_PORT = 587;
const SMTP_SECURE = false;

const DNS_CACHE_TTL_MS = 5 * 60 * 1000;

// Failures that a different IP address cannot fix - stop cycling addresses.
const FATAL_SMTP_CODES = new Set(["EAUTH", "EENVELOPE", "EMESSAGE"]);

const isProduction = () => (process.env.NODE_ENV || ENV.NODE_ENV) === "production";

/** Thrown when a message could not be handed to the SMTP server. */
export class EmailDeliveryError extends Error {
  constructor(message = "Failed to send email") {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

const getCredentials = () => {
  const user = (ENV.EMAIL_USER || process.env.EMAIL_USER || "").trim();
  const rawPass = (ENV.EMAIL_PASS || process.env.EMAIL_PASS || "").trim();
  // Strip spaces from Gmail App Password if user pasted it formatted as "xxxx xxxx xxxx xxxx"
  return { user, pass: rawPass.replace(/\s+/g, "") };
};

const hasCredentials = () => {
  const { user, pass } = getCredentials();
  return Boolean(user && pass);
};

/** Redacted view of an SMTP failure. Never logs EMAIL_USER or EMAIL_PASS. */
const describeSmtpError = (error) => ({
  code: error?.code,
  command: error?.command,
  responseCode: error?.responseCode,
  message: error?.message,
});

let cachedAddresses = [];
let cachedAt = 0;

/*
 * Resolves SMTP_HOST to both IPv4 and IPv6 addresses.
 *
 * Checks both A and AAAA records using dns.promises.resolve4/resolve6,
 * and falls back to dual-stack getaddrinfo lookup if needed.
 */
const resolveAddresses = async () => {
  if (cachedAddresses.length && Date.now() - cachedAt < DNS_CACHE_TTL_MS) {
    return cachedAddresses;
  }

  const remember = (addresses) => {
    cachedAddresses = addresses;
    cachedAt = Date.now();
    return addresses;
  };

  const ipv4List = [];
  const ipv6List = [];

  // 1. Try resolve4 (IPv4)
  try {
    const aRecords = await dns.promises.resolve4(SMTP_HOST);
    if (aRecords?.length) ipv4List.push(...aRecords);
  } catch (error) {
    // Non-fatal, handled by fallback
  }

  // 2. Try resolve6 (IPv6)
  try {
    const aaaaRecords = await dns.promises.resolve6(SMTP_HOST);
    if (aaaaRecords?.length) ipv6List.push(...aaaaRecords);
  } catch (error) {
    // Non-fatal, handled by fallback
  }

  // 3. Fallback to lookup for both IPv4 and IPv6 if either is empty
  if (!ipv4List.length || !ipv6List.length) {
    try {
      const records = await dns.promises.lookup(SMTP_HOST, { all: true });
      (records || []).forEach((record) => {
        if (record.family === 4 && !ipv4List.includes(record.address)) {
          ipv4List.push(record.address);
        } else if (record.family === 6 && !ipv6List.includes(record.address)) {
          ipv6List.push(record.address);
        }
      });
    } catch (error) {
      console.warn(
        `[Nodemailer] Dual-stack lookup for ${SMTP_HOST} failed:`,
        error?.code || error?.message
      );
    }
  }

  // Combine both IPv4 and IPv6 addresses (IPv4 first, followed by IPv6)
  const combined = [...ipv4List, ...ipv6List];
  if (combined.length) {
    return remember(combined);
  }

  // If IP lookup failed, use the hostname directly as fallback
  return [SMTP_HOST];
};

/*
 * Builds a transport pinned to an IPv4/IPv6 literal or host.
 * servername ensures proper SNI and TLS certificate validation.
 */
const buildTransporter = (address) => {
  const { user, pass } = getCredentials();

  return nodemailer.createTransport({
    host: address,
    port: SMTP_PORT,
    secure: SMTP_SECURE, // false on 587 - the session is upgraded with STARTTLS
    requireTLS: !SMTP_SECURE, // refuse to send in the clear if STARTTLS is unavailable
    servername: SMTP_HOST, // SNI + certificate hostname on the implicit-TLS path
    auth: {
      user,
      pass,
    },
    // Fail fast instead of holding an HTTP request open on a dead route.
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    tls: {
      // Merged into tls.connect() during the STARTTLS upgrade: SNI is sent as
      // smtp.gmail.com and the certificate is validated against that name
      // rather than against the IP literal we dialled.
      servername: SMTP_HOST,
      minVersion: "TLSv1.2",
    },
  });
};

let activeTransport = null; // { address, transporter }

const closeActiveTransport = () => {
  if (!activeTransport) return;
  try {
    activeTransport.transporter.close();
  } catch {
    // already torn down
  }
  activeTransport = null;
};

const getTransportFor = (address) => {
  if (activeTransport?.address === address) return activeTransport.transporter;
  closeActiveTransport();
  activeTransport = { address, transporter: buildTransporter(address) };
  return activeTransport.transporter;
};

/*
 * Runs an SMTP operation against the resolved IPv4/IPv6 addresses, moving to the
 * next address when one is unreachable. The last address that worked is tried
 * first so the common path is a single fast connection.
 */
const runOnTransport = async (operation, label) => {
  const addresses = await resolveAddresses();

  if (!addresses.length) {
    throw new EmailDeliveryError(`Could not resolve an IPv4 or IPv6 address for ${SMTP_HOST}`);
  }

  const lastGood = activeTransport?.address;
  const ordered =
    lastGood && addresses.includes(lastGood)
      ? [lastGood, ...addresses.filter((address) => address !== lastGood)]
      : addresses;

  let lastError;

  for (const address of ordered) {
    try {
      return await operation(getTransportFor(address), address);
    } catch (error) {
      lastError = error;
      console.error(
        `[Nodemailer] ${label} failed via ${address}:${SMTP_PORT}:`,
        describeSmtpError(error)
      );

      if (FATAL_SMTP_CODES.has(error?.code)) break;

      // Drop the unusable transport so the next address gets a fresh one.
      if (activeTransport?.address === address) closeActiveTransport();
    }
  }

  throw lastError;
};

/** Connects and authenticates without sending anything. Resolves to the address used. */
export const verifyEmailTransport = async () => {
  if (!hasCredentials()) {
    throw new EmailDeliveryError("EMAIL_USER / EMAIL_PASS are not configured");
  }

  return runOnTransport(async (transporter, address) => {
    await transporter.verify();
    return address;
  }, "verify");
};

// Verify Nodemailer transporter configuration at startup
if (hasCredentials()) {
  console.log(
    `[Nodemailer] SMTP transport: ${SMTP_HOST}:${SMTP_PORT} with dual-stack IPv4 & IPv6 ` +
      `(secure=${SMTP_SECURE}, STARTTLS=${!SMTP_SECURE}, TLS servername=${SMTP_HOST}).`
  );

  verifyEmailTransport()
    .then((address) => {
      console.log(
        `[Nodemailer] Transporter is ready to send emails via Gmail (connected to ${address}:${SMTP_PORT}).`
      );
    })
    .catch((error) => {
      console.error("[Nodemailer] Configuration error:", describeSmtpError(error));
      if (error?.code === "EAUTH") {
        console.error(
          "[Nodemailer] SMTP authentication failed. EMAIL_PASS must be a Gmail App Password, not the account password."
        );
      }
      if (!isProduction()) {
        console.log("[Nodemailer] Falling back to console OTP logging for local development.");
      }
    });
} else {
  console.log("[Nodemailer] No Gmail EMAIL_USER or EMAIL_PASS provided in .env. Console OTP fallback is active.");
}

const logToConsole = (label, { to, subject, text }) => {
  console.log(`\n========================================`);
  console.log(`[${label}]`);
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Text: ${text}`);
  console.log(`========================================\n`);
};

/*
 * Hands a message to the SMTP server.
 *
 * Resolves only once the server has accepted the message. In production a
 * failure throws EmailDeliveryError so callers cannot report "code sent" for a
 * message that was never delivered. Local development keeps the console
 * fallback so the app stays usable without SMTP credentials.
 */
const sendMail = async ({ to, subject, html, text }) => {
  const fromEmail = getCredentials().user;

  if (!hasCredentials()) {
    if (isProduction()) {
      console.error(
        `[EmailService] EMAIL_USER / EMAIL_PASS are not configured - cannot deliver "${subject}" to ${to}`
      );
      throw new EmailDeliveryError("Email service is not configured");
    }
    // Development mode fallback when EMAIL_USER or EMAIL_PASS is missing
    logToConsole("DEV MODE EMAIL - MISSING EMAIL_USER OR EMAIL_PASS", { to, subject, text });
    return null;
  }

  const mailOptions = {
    from: fromEmail,
    to,
    subject,
    html,
    text,
  };

  try {
    const info = await runOnTransport(
      (transporter) => transporter.sendMail(mailOptions),
      `send to ${to}`
    );

    // An address in `rejected` means the server refused that recipient.
    if (info?.rejected?.length) {
      console.error(`[EmailService] SMTP rejected recipient(s) for ${to}:`, info.rejected);
      throw new EmailDeliveryError("Email was rejected by the mail server");
    }

    console.log(`[EmailService] Email sent to ${to}. MessageId: ${info.messageId}`);
    return info;
  } catch (error) {
    if (!(error instanceof EmailDeliveryError)) {
      console.error(`[EmailService] SMTP send failed for ${to}:`, describeSmtpError(error));
    }

    if (isProduction()) {
      // Generic message only - SMTP details stay in the server logs.
      throw error instanceof EmailDeliveryError ? error : new EmailDeliveryError("Failed to send email");
    }

    // Fallback log to console if Nodemailer fails (e.g. invalid Gmail app password)
    logToConsole("FALLBACK EMAIL LOG", { to, subject, text });
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
  sendRegistrationOtp: async (email, otp, name) => {
    const subject = `${otp} is your VibeVerse verification code`;
    const text = `Hello ${name || "there"}, your VibeVerse registration verification code is: ${otp}. It expires in 10 minutes.`;
    const html = getOtpTemplate("Email Verification", name, otp, "Please use the code below to verify your email address and complete your VibeVerse registration.");
    return sendMail({ to: email, subject, html, text });
  },

  sendForgotPasswordOtp: async (email, otp, name) => {
    const subject = `${otp} is your VibeVerse password reset code`;
    const text = `Hello, your VibeVerse password reset OTP code is: ${otp}. It expires in 10 minutes.`;
    const html = getOtpTemplate("Password Reset Request", name, otp, "We received a request to reset your VibeVerse account password. Use the verification code below to set a new password.");
    return sendMail({ to: email, subject, html, text });
  },

  sendChangePasswordOtp: async (email, otp, name) => {
    const subject = `${otp} is your VibeVerse change password code`;
    const text = `Hello, your VibeVerse change password verification code is: ${otp}. It expires in 10 minutes.`;
    const html = getOtpTemplate("Change Password Verification", name, otp, "You requested to change your password from your account settings. Use the code below to confirm this change.");
    return sendMail({ to: email, subject, html, text });
  },

  sendWelcomeEmail: async (email, name) => {
    const subject = "Welcome to VibeVerse!";
    const text = `Welcome to VibeVerse, ${name}! Your email address has been verified. You can now log in, chat in real-time, and play multiplayer games!`;
    const html = `
      <div style="font-family: Arial, sans-serif; background: #0f172a; color: #f8fafc; padding: 30px; text-align: center;">
        <h1 style="color: #06b6d4;">Welcome to VibeVerse! 💬🎮</h1>
        <p style="font-size: 16px; color: #cbd5e1;">Hi ${name}, your email is now verified!</p>
        <p style="font-size: 14px; color: #94a3b8;">Start direct messaging, group chatting, and playing interactive real-time games with your friends.</p>
      </div>
    `;
    return sendMail({ to: email, subject, html, text });
  },
};
