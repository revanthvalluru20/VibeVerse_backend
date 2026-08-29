import dns from "node:dns";
import mongoose from "mongoose";
import { ENV } from "./env.js";

// Configure reliable public DNS servers for MongoDB SRV (_mongodb._tcp) resolution
try {
  dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
} catch (e) {
  // Ignored if custom DNS is not permitted
}

// Prefer IPv4 for reliable cloud host routing
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {
  // Ignored for older Node versions
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export const connectDB = async () => {
  const uri = ENV.MONGO_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI is not defined in environment variables");
  }

  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      bufferCommands: false,
    };

    console.log("Connecting to MongoDB...");
    cached.promise = mongoose.connect(uri, opts).then((mongooseInstance) => {
      console.log("✅ Database connection established successfully");
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    console.error("❌ Database connection error:", error.message);
    throw error;
  }

  return cached.conn;
};