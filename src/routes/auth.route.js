import express from "express";
import {
  signup,
  verifyRegistrationOtp,
  resendRegistrationOtp,
  login,
  logout,
  checkAuth,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  resendResetOtp,
  requestChangePasswordOtp,
  changePassword,
  updateProfile,
} from "../controllers/auth.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { authRateLimiter, otpRateLimiter } from "../middleware/rateLimiter.middleware.js";

const router = express.Router();

// Registration & Login
router.post("/signup", authRateLimiter, signup);
router.post("/register", authRateLimiter, signup);
router.post("/verify-registration-otp", otpRateLimiter, verifyRegistrationOtp);
router.post("/resend-registration-otp", otpRateLimiter, resendRegistrationOtp);

router.post("/login", authRateLimiter, login);
router.post("/logout", logout);
router.get("/check", protectRoute, checkAuth);

// Forgot Password Flow
router.post("/forgot-password", otpRateLimiter, forgotPassword);
router.post("/verify-reset-otp", otpRateLimiter, verifyResetOtp);
router.post("/reset-password", authRateLimiter, resetPassword);
router.post("/resend-reset-otp", otpRateLimiter, resendResetOtp);

// Change Password Flow (Authenticated)
router.post("/change-password/request-otp", protectRoute, otpRateLimiter, requestChangePasswordOtp);
router.post("/change-password", protectRoute, authRateLimiter, changePassword);

// Profile
router.put("/update-profile", protectRoute, updateProfile);

export default router;
