import crypto from "crypto";
import bcrypt from "bcryptjs";
import OTP from "../models/OTP.js";

const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

export const otpService = {
  /**
   * Generates a 6-digit random code using crypto.randomInt
   */
  generateOTP: () => {
    return crypto.randomInt(100000, 1000000).toString();
  },

  /**
   * Checks whether a new OTP request is allowed (resend cooldown)
   */
  canResendOTP: async (email, purpose) => {
    const latestOtp = await OTP.findOne({
      email: email.toLowerCase(),
      purpose,
    }).sort({ createdAt: -1 });

    if (latestOtp) {
      const secondsSinceCreation = Math.floor((Date.now() - new Date(latestOtp.createdAt).getTime()) / 1000);
      if (secondsSinceCreation < RESEND_COOLDOWN_SECONDS) {
        return {
          allowed: false,
          waitSeconds: RESEND_COOLDOWN_SECONDS - secondsSinceCreation,
        };
      }
    }
    return { allowed: true, waitSeconds: 0 };
  },

  /**
   * Generates, hashes and persists a new OTP record
   */
  storeOTP: async (userId, email, otp, purpose) => {
    const cleanEmail = email.toLowerCase();

    // Invalidate existing unused active OTPs for this email and purpose
    await OTP.updateMany(
      { email: cleanEmail, purpose, used: false },
      { $set: { used: true } }
    );

    const salt = await bcrypt.genSalt(10);
    const otpHash = await bcrypt.hash(otp, salt);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    const newOtp = new OTP({
      userId: userId || null,
      email: cleanEmail,
      otpHash,
      purpose,
      expiresAt,
      attempts: 0,
      used: false,
    });

    await newOtp.save();
    return newOtp;
  },

  /**
   * Validates provided OTP code against stored hash
   */
  verifyOTP: async (email, otp, purpose) => {
    const cleanEmail = email.toLowerCase();

    const otpRecord = await OTP.findOne({
      email: cleanEmail,
      purpose,
      used: false,
    }).sort({ createdAt: -1 });

    if (!otpRecord) {
      return {
        valid: false,
        message: "No active verification code found. Please request a new code.",
      };
    }

    if (new Date() > new Date(otpRecord.expiresAt)) {
      otpRecord.used = true;
      await otpRecord.save();
      return {
        valid: false,
        message: "Verification code has expired. Please request a new code.",
      };
    }

    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      otpRecord.used = true;
      await otpRecord.save();
      return {
        valid: false,
        message: "Maximum verification attempts exceeded. Please request a new code.",
      };
    }

    // Increment attempt count
    otpRecord.attempts += 1;

    const isMatch = await bcrypt.compare(otp, otpRecord.otpHash);
    if (!isMatch) {
      await otpRecord.save();
      const remaining = MAX_ATTEMPTS - otpRecord.attempts;
      return {
        valid: false,
        message: remaining > 0 ? `Invalid code. ${remaining} attempts remaining.` : "Invalid code. Maximum attempts exceeded.",
      };
    }

    // Mark as successfully used
    otpRecord.used = true;
    await otpRecord.save();

    return { valid: true, userId: otpRecord.userId };
  },
};
