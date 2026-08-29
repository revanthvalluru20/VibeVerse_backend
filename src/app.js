import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";

import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import gameRoutes from "./routes/game.route.js";
import friendRoutes from "./routes/friend.route.js";
import userRoutes from "./routes/user.route.js";
import storyRoutes from "./routes/story.route.js";
import gameScoreRoutes from "./routes/gameScore.route.js";
import communityRoutes from "./routes/community.route.js";
import memoryRoutes from "./routes/memory.route.js";
import callRoutes from "./routes/call.route.js";
import { connectDB } from "./lib/db.js";
import { ENV } from "./lib/env.js";
import { app } from "./lib/socket.js";
import mongoose from "mongoose";

// Parse allowed CORS origins from CLIENT_URL
const allowedOrigins = ENV.CLIENT_URL
  ? ENV.CLIENT_URL.split(",").map((url) => url.trim().replace(/\/+$/, ""))
  : ["http://localhost:5173", "http://localhost:3000"];

/*
 * Render terminates TLS at its edge proxy and forwards the client IP in
 * X-Forwarded-For. Trusting exactly one proxy hop makes req.ip the real client
 * address and stops express-rate-limit raising ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
 * Set once here, in the main application initialisation.
 */
app.set("trust proxy", 1);

app.use(express.json({ limit: "10mb" }));
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, same-origin, server-to-server)
      if (!origin) return callback(null, true);

      // Check against configured CLIENT_URL origins or localhost or Vercel
      if (
        allowedOrigins.includes(origin) ||
        allowedOrigins.includes("*") ||
        (ENV.NODE_ENV !== "production" && origin.includes("localhost")) ||
        origin.endsWith(".vercel.app")
      ) {
        return callback(null, true);
      }

      return callback(new Error(`CORS error: Origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

app.use(cookieParser());

// Lightweight Health Check Endpoints for deployment verification
const handleHealthCheck = (_, res) => {
  res.status(200).json({
    success: true,
    service: "VibeVerse API",
    status: "healthy",
    dbReady: mongoose.connection.readyState === 1,
    timestamp: new Date().toISOString(),
  });
};

app.get("/health", handleHealthCheck);
app.get("/api/health", handleHealthCheck);
app.get("/", (_, res) => {
  res.status(200).json({
    success: true,
    service: "VibeVerse API",
    message: "VibeVerse Backend API is running successfully",
    dbReady: mongoose.connection.readyState === 1,
  });
});

// Serverless / dynamic MongoDB connection middleware for API routes
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database connection middleware error:", error.message);
    res.status(500).json({ success: false, message: "Database connection failed", error: error.message });
  }
});

// Mount Application Routes
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);
app.use("/api/games", gameRoutes);
app.use("/api/friends", friendRoutes);
app.use("/api/users", userRoutes);
app.use("/api/stories", storyRoutes);
app.use("/api/game-scores", gameScoreRoutes);
app.use("/api/communities", communityRoutes);
app.use("/api/memories", memoryRoutes);
app.use("/api/calls", callRoutes);

// Catch-all 404 handler for undefined API endpoints
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl} - Endpoint not found`,
  });
});

// Centralized error handling middleware (avoids leaking stack traces in production)
app.use((err, req, res, next) => {
  console.error("Unhandled API Error:", err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || "Internal server error",
    ...((process.env.NODE_ENV !== "production" && ENV.NODE_ENV !== "production") && { stack: err.stack }),
  });
});

export default app;
