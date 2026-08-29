import app from "./app.js";
import { server } from "./lib/socket.js";
import { seedDefaultCommunities } from "./controllers/community.controller.js";
import { connectDB } from "./lib/db.js";
import { ENV } from "./lib/env.js";

const PORT = process.env.PORT || ENV.PORT || 5000;

server.listen(PORT, "0.0.0.0", async () => {
  console.log(`🚀 VibeVerse Server running on port ${PORT} in ${process.env.NODE_ENV || ENV.NODE_ENV || "development"} mode`);
  try {
    await connectDB();
    await seedDefaultCommunities();
  } catch (err) {
    console.error("❌ Database connection initialization failed:", err.message);
  }
});
