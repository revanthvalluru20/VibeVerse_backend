import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { generateToken } from "../lib/utils.js";
import { emailService, EmailDeliveryError } from "../services/emailService.js";
import { otpService } from "../services/otpService.js";
import cloudinary from "../lib/cloudinary.js";

// Helper function to generate a unique username if not provided
const generateUniqueUsername = async (base) => {
  let cleanBase = base.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 15);
  if (cleanBase.length < 3) cleanBase = "user";

  let username = cleanBase;
  let exists = await User.findOne({ username });

  while (exists) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    username = `${cleanBase.slice(0, 15)}_${randomSuffix}`;
    exists = await User.findOne({ username });
  }

  return username;
};

/*
 * OTP delivery is part of the request, not a background task: the API must not
 * answer "verification code sent" for a message the mail server never accepted.
 * The SMTP cause is logged server-side only - the client gets a generic message
 * so no credentials or transport details leak.
 */
const OTP_EMAIL_FAILED_MESSAGE =
  "We could not send the verification email right now. Please try again in a few moments.";

const respondEmailFailure = (res, context, error) => {
  const cause = error instanceof EmailDeliveryError ? error.message : error?.message || error;
  console.error(`[Auth] ${context}:`, cause);
  return res.status(502).json({ message: OTP_EMAIL_FAILED_MESSAGE });
};

// REGISTRATION
export const signup = async (req, res) => {
  const { fullName, email, password, username: inputUsername } = req.body;

  try {
    if (!fullName || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check / format username (alphanumeric and underscore only, 3-30 chars)
    let finalUsername;
    if (inputUsername && inputUsername.trim()) {
      const usernameCandidate = inputUsername.toLowerCase().trim();
      const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
      if (!usernameRegex.test(usernameCandidate)) {
        return res.status(400).json({
          message: "Username must be 3-30 characters long and contain only letters, numbers, and underscores (_)",
        });
      }

      const existingUsernameUser = await User.findOne({
        username: usernameCandidate,
        email: { $ne: cleanEmail },
      });
      if (existingUsernameUser) {
        return res.status(400).json({ message: "Username is already taken" });
      }
      finalUsername = usernameCandidate;
    } else {
      finalUsername = await generateUniqueUsername(fullName || cleanEmail.split("@")[0]);
    }

    const existingUser = await User.findOne({ email: cleanEmail });

    if (existingUser) {
      if (existingUser.emailVerified) {
        return res.status(400).json({ message: "Email already exists" });
      } else {
        // Unverified user exists - update details & resend OTP
        const salt = await bcrypt.genSalt(10);
        existingUser.password = await bcrypt.hash(password, salt);
        existingUser.fullName = fullName;
        existingUser.username = finalUsername;
        await existingUser.save();

        const otp = otpService.generateOTP();
        await otpService.storeOTP(existingUser._id, cleanEmail, otp, "EMAIL_VERIFICATION");
        try {
          await emailService.sendRegistrationOtp(cleanEmail, otp, fullName);
        } catch (error) {
          return respondEmailFailure(res, "Failed to send registration OTP email", error);
        }

        return res.status(200).json({
          requireOtp: true,
          email: cleanEmail,
          message: "Verification code sent to your email",
        });
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      fullName,
      username: finalUsername,
      email: cleanEmail,
      password: hashedPassword,
      emailVerified: false,
    });

    const savedUser = await newUser.save();

    const otp = otpService.generateOTP();
    await otpService.storeOTP(savedUser._id, cleanEmail, otp, "EMAIL_VERIFICATION");
    try {
      await emailService.sendRegistrationOtp(cleanEmail, otp, fullName);
    } catch (error) {
      return respondEmailFailure(res, "Failed to send registration OTP email", error);
    }

    res.status(201).json({
      requireOtp: true,
      email: cleanEmail,
      message: "Verification code sent to your email address",
    });
  } catch (error) {
    console.error("Error in signup controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const verifyRegistrationOtp = async (req, res) => {
  const { email, otp } = req.body;

  try {
    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" });
    }

    const cleanEmail = email.toLowerCase().trim();
    const result = await otpService.verifyOTP(cleanEmail, otp, "EMAIL_VERIFICATION");

    if (!result.valid) {
      return res.status(400).json({ message: result.message });
    }

    const user = await User.findOne({ email: cleanEmail });
    if (!user) {
      return res.status(404).json({ message: "User account not found" });
    }

    // Ensure username is populated if previously null
    if (!user.username) {
      user.username = await generateUniqueUsername(user.fullName || user.email.split("@")[0]);
    }

    user.emailVerified = true;
    await user.save();

    generateToken(user._id, res);

    // Send welcome email asynchronously
    emailService.sendWelcomeEmail(user.email, user.fullName).catch((err) =>
      console.error("Failed to send welcome email:", err)
    );

    res.status(200).json({
      _id: user._id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      profilePic: user.profilePic,
      emailVerified: true,
    });
  } catch (error) {
    console.error("Error in verifyRegistrationOtp controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const resendRegistrationOtp = async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) return res.status(400).json({ message: "Email is required" });

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });

    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.emailVerified) return res.status(400).json({ message: "Email is already verified" });

    const cooldown = await otpService.canResendOTP(cleanEmail, "EMAIL_VERIFICATION");
    if (!cooldown.allowed) {
      return res.status(429).json({
        message: `Please wait ${cooldown.waitSeconds} seconds before requesting a new code.`,
      });
    }

    const otp = otpService.generateOTP();
    await otpService.storeOTP(user._id, cleanEmail, otp, "EMAIL_VERIFICATION");
    try {
      await emailService.sendRegistrationOtp(cleanEmail, otp, user.fullName);
    } catch (error) {
      return respondEmailFailure(res, "Failed to resend registration OTP email", error);
    }

    res.status(200).json({ message: "A new verification code has been sent to your email" });
  } catch (error) {
    console.error("Error in resendRegistrationOtp controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// LOGIN
export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  try {
    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    const isPasswordCorrect = await bcrypt.compare(password, user.password);
    if (!isPasswordCorrect) return res.status(400).json({ message: "Invalid credentials" });

    if (!user.emailVerified) {
      const otp = otpService.generateOTP();
      await otpService.storeOTP(user._id, cleanEmail, otp, "EMAIL_VERIFICATION");
      try {
        await emailService.sendRegistrationOtp(cleanEmail, otp, user.fullName);
      } catch (error) {
        return respondEmailFailure(res, "Failed to send registration OTP email on login", error);
      }

      return res.status(403).json({
        requireOtp: true,
        email: cleanEmail,
        message: "Email is not verified. A verification code has been sent to your email.",
      });
    }

    // Ensure username is populated if missing
    if (!user.username) {
      user.username = await generateUniqueUsername(user.fullName || user.email.split("@")[0]);
      await user.save();
    }

    generateToken(user._id, res);

    res.status(200).json({
      _id: user._id,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      profilePic: user.profilePic,
      emailVerified: true,
    });
  } catch (error) {
    console.error("Error in login controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// LOGOUT & CHECK
export const logout = (_, res) => {
  const isProduction = process.env.NODE_ENV === "production" || process.env.CLIENT_URL?.startsWith("https");
  res.cookie("jwt", "", {
    maxAge: 0,
    httpOnly: true,
    sameSite: isProduction ? "lax" : "lax",
    secure: isProduction,
    path: "/",
  });
  res.status(200).json({ message: "Logged out successfully" });
};

export const checkAuth = async (req, res) => {
  try {
    // Ensure user has a username
    if (!req.user.username) {
      req.user.username = await generateUniqueUsername(req.user.fullName || req.user.email.split("@")[0]);
      await req.user.save();
    }
    res.status(200).json(req.user);
  } catch (error) {
    console.log("Error in checkAuth controller", error.message);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

// FORGOT PASSWORD FLOW
export const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) return res.status(400).json({ message: "Email is required" });

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });

    if (!user) {
      return res.status(200).json({
        requireOtp: true,
        email: cleanEmail,
        message: "If an account with that email exists, an OTP verification code was sent.",
      });
    }

    const cooldown = await otpService.canResendOTP(cleanEmail, "PASSWORD_RESET");
    if (!cooldown.allowed) {
      return res.status(429).json({
        message: `Please wait ${cooldown.waitSeconds} seconds before requesting a new code.`,
      });
    }

    const otp = otpService.generateOTP();
    await otpService.storeOTP(user._id, cleanEmail, otp, "PASSWORD_RESET");
    try {
      await emailService.sendForgotPasswordOtp(cleanEmail, otp, user.fullName);
    } catch (error) {
      return respondEmailFailure(res, "Failed to send forgot password OTP email", error);
    }

    res.status(200).json({
      requireOtp: true,
      email: cleanEmail,
      message: "Password reset verification code sent to your email",
    });
  } catch (error) {
    console.error("Error in forgotPassword controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const verifyResetOtp = async (req, res) => {
  const { email, otp } = req.body;

  try {
    if (!email || !otp) return res.status(400).json({ message: "Email and OTP are required" });

    const cleanEmail = email.toLowerCase().trim();
    const result = await otpService.verifyOTP(cleanEmail, otp, "PASSWORD_RESET");

    if (!result.valid) {
      return res.status(400).json({ message: result.message });
    }

    res.status(200).json({
      valid: true,
      message: "Verification successful. You may now enter your new password.",
    });
  } catch (error) {
    console.error("Error in verifyResetOtp controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const resetPassword = async (req, res) => {
  const { email, otp, newPassword } = req.body;

  try {
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Email, OTP code, and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) return res.status(404).json({ message: "User not found" });

    const result = await otpService.verifyOTP(cleanEmail, otp, "PASSWORD_RESET");
    if (!result.valid) {
      return res.status(400).json({ message: result.message });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    const isProduction = process.env.NODE_ENV === "production" || process.env.CLIENT_URL?.startsWith("https");
    res.cookie("jwt", "", {
      maxAge: 0,
      httpOnly: true,
      sameSite: isProduction ? "lax" : "lax",
      secure: isProduction,
      path: "/",
    });

    res.status(200).json({ message: "Password has been reset successfully. You can now login with your new password." });
  } catch (error) {
    console.error("Error in resetPassword controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const resendResetOtp = async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) return res.status(400).json({ message: "Email is required" });

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });

    if (!user) return res.status(404).json({ message: "User not found" });

    const cooldown = await otpService.canResendOTP(cleanEmail, "PASSWORD_RESET");
    if (!cooldown.allowed) {
      return res.status(429).json({
        message: `Please wait ${cooldown.waitSeconds} seconds before requesting a new code.`,
      });
    }

    const otp = otpService.generateOTP();
    await otpService.storeOTP(user._id, cleanEmail, otp, "PASSWORD_RESET");
    try {
      await emailService.sendForgotPasswordOtp(cleanEmail, otp, user.fullName);
    } catch (error) {
      return respondEmailFailure(res, "Failed to resend password reset OTP email", error);
    }

    res.status(200).json({ message: "A new password reset code has been sent to your email" });
  } catch (error) {
    console.error("Error in resendResetOtp controller:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// CHANGE PASSWORD (AUTHENTICATED USER)
export const requestChangePasswordOtp = async (req, res) => {
  const { currentPassword } = req.body;

  try {
    if (!currentPassword) return res.status(400).json({ message: "Current password is required" });

    const user = await User.findById(req.user._id);
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    const cooldown = await otpService.canResendOTP(user.email, "CHANGE_PASSWORD");
    if (!cooldown.allowed) {
      return res.status(429).json({
        message: `Please wait ${cooldown.waitSeconds} seconds before requesting a new code.`,
      });
    }

    const otp = otpService.generateOTP();
    await otpService.storeOTP(user._id, user.email, otp, "CHANGE_PASSWORD");
    try {
      await emailService.sendChangePasswordOtp(user.email, otp, user.fullName);
    } catch (error) {
      return respondEmailFailure(res, "Failed to send change password OTP email", error);
    }

    res.status(200).json({ message: "Change password verification code sent to your registered email address" });
  } catch (error) {
    console.error("Error in requestChangePasswordOtp:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const changePassword = async (req, res) => {
  const { currentPassword, otp, newPassword } = req.body;

  try {
    if (!currentPassword || !otp || !newPassword) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const user = await User.findById(req.user._id);
    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }

    const result = await otpService.verifyOTP(user.email, otp, "CHANGE_PASSWORD");
    if (!result.valid) {
      return res.status(400).json({ message: result.message });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("Error in changePassword:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// PROFILE
export const updateProfile = async (req, res) => {
  try {
    const { profilePic, username } = req.body;
    const userId = req.user._id;

    const updates = {};

    if (profilePic) {
      const uploadResponse = await cloudinary.uploader.upload(profilePic);
      updates.profilePic = uploadResponse.secure_url;
    }

    if (username && username.trim()) {
      const cleanUsername = username.toLowerCase().trim().replace(/[^a-z0-9_]/g, "");
      if (cleanUsername.length >= 3) {
        const existing = await User.findOne({ username: cleanUsername, _id: { $ne: userId } });
        if (existing) {
          return res.status(400).json({ message: "Username is already taken" });
        }
        updates.username = cleanUsername;
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true }
    ).select("-password");

    res.status(200).json(updatedUser);
  } catch (error) {
    console.log("Error in update profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
