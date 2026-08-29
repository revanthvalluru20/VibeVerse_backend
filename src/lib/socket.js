import { Server } from "socket.io";
import http from "http";
import express from "express";
import { ENV } from "./env.js";
import { socketAuthMiddleware } from "../middleware/socket.auth.middleware.js";
import User from "../models/User.js";
import Game from "../models/Game.js";
import Message from "../models/Message.js";
import { gameEngine } from "../services/gameEngine.js";

const app = express();
const server = http.createServer(app);

const allowedOrigins = ENV.CLIENT_URL
  ? ENV.CLIENT_URL.split(",").map((url) => url.trim().replace(/\/+$/, ""))
  : ["http://localhost:5173", "http://localhost:3000"];

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.includes(origin) ||
        allowedOrigins.includes("*") ||
        (ENV.NODE_ENV !== "production" && origin.includes("localhost")) ||
        origin.endsWith(".vercel.app")
      ) {
        return callback(null, true);
      }
      return callback(new Error(`Socket CORS error: Origin ${origin} not allowed`));
    },
    credentials: true,
  },
});

io.use(socketAuthMiddleware);

const userSocketMap = {}; // { userId: socketId }

export function getReceiverSocketId(userId) {
  return userSocketMap[userId];
}

const activeCalls = {}; // { userId: { partnerId, type, callId } }

io.on("connection", (socket) => {
  const userId = socket.userId;
  userSocketMap[userId] = socket.id;

  console.log(`User connected: ${socket.user.fullName} (${userId})`);

  // Broadcast online user list
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // 1-to-1 Typing indicators
  socket.on("typing:start", ({ receiverId }) => {
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("typing:start", { senderId: userId });
    }
  });

  socket.on("typing:stop", ({ receiverId }) => {
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("typing:stop", { senderId: userId });
    }
  });

  // 1-to-1 Instant Read Receipt (Blue tick)
  socket.on("message:read", async ({ senderId }) => {
    try {
      if (!senderId) return;
      await Message.updateMany(
        { senderId, receiverId: userId, status: { $ne: "read" } },
        { $set: { status: "read" } }
      );
      const senderSocketId = getReceiverSocketId(senderId.toString());
      if (senderSocketId) {
        io.to(senderSocketId).emit("message:read", {
          readerId: userId.toString(),
          senderId: senderId.toString(),
        });
      }
    } catch (err) {
      console.error("Error in socket message:read:", err);
    }
  });

  // COMMUNITY ROOM SOCKET CHAT
  socket.on("room:join", ({ roomId }) => {
    if (roomId) {
      socket.join(`room:${roomId}`);
    }
  });

  socket.on("room:leave", ({ roomId }) => {
    if (roomId) {
      socket.leave(`room:${roomId}`);
    }
  });

  socket.on("room:typing:start", ({ roomId, user }) => {
    if (roomId) {
      socket.to(`room:${roomId}`).emit("room:typing:start", {
        roomId,
        userId,
        fullName: user?.fullName || socket.user.fullName,
      });
    }
  });

  socket.on("room:typing:stop", ({ roomId }) => {
    if (roomId) {
      socket.to(`room:${roomId}`).emit("room:typing:stop", { roomId, userId });
    }
  });

  // ==========================================
  // WEBRTC 1-TO-1 VIDEO & VOICE CALL SIGNALING
  // ==========================================

  // 1. Caller initiates call request
  socket.on("call:request", ({ receiverId, callType = "VIDEO_CALL", callId }) => {
    const receiverSocketId = getReceiverSocketId(receiverId);

    if (activeCalls[receiverId]) {
      // Receiver is in another call
      socket.emit("call:busy", { receiverId, message: "User is currently in another call" });
      return;
    }

    if (!receiverSocketId) {
      socket.emit("call:failed", { message: "User is currently offline" });
      return;
    }

    activeCalls[userId] = { partnerId: receiverId, type: callType, callId };

    io.to(receiverSocketId).emit("call:incoming", {
      caller: {
        _id: socket.user._id,
        fullName: socket.user.fullName,
        username: socket.user.username,
        profilePic: socket.user.profilePic,
      },
      callType,
      callId,
    });
  });

  // 2. Receiver accepts call
  socket.on("call:accept", ({ callerId, callId }) => {
    const callerSocketId = getReceiverSocketId(callerId);
    activeCalls[userId] = { partnerId: callerId, callId };

    if (callerSocketId) {
      io.to(callerSocketId).emit("call:accepted", {
        receiver: {
          _id: socket.user._id,
          fullName: socket.user.fullName,
          username: socket.user.username,
          profilePic: socket.user.profilePic,
        },
        callId,
      });
    }
  });

  // 3. Receiver declines call
  socket.on("call:decline", ({ callerId }) => {
    delete activeCalls[userId];
    delete activeCalls[callerId];
    const callerSocketId = getReceiverSocketId(callerId);
    if (callerSocketId) {
      io.to(callerSocketId).emit("call:declined", { receiverId: userId });
    }
  });

  // 4. Caller cancels call before receiver answers
  socket.on("call:cancel", ({ receiverId }) => {
    delete activeCalls[userId];
    delete activeCalls[receiverId];
    const receiverSocketId = getReceiverSocketId(receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("call:cancelled", { callerId: userId });
    }
  });

  // 5. WebRTC Offer (SDP)
  socket.on("call:offer", ({ targetUserId, sdp }) => {
    const targetSocketId = getReceiverSocketId(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call:offer", { senderId: userId, sdp });
    }
  });

  // 6. WebRTC Answer (SDP)
  socket.on("call:answer", ({ targetUserId, sdp }) => {
    const targetSocketId = getReceiverSocketId(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call:answer", { senderId: userId, sdp });
    }
  });

  // 7. WebRTC ICE Candidate
  socket.on("call:ice-candidate", ({ targetUserId, candidate }) => {
    const targetSocketId = getReceiverSocketId(targetUserId);
    if (targetSocketId) {
      io.to(targetSocketId).emit("call:ice-candidate", { senderId: userId, candidate });
    }
  });

  // 8. End Call
  socket.on("call:end", ({ partnerId }) => {
    delete activeCalls[userId];
    delete activeCalls[partnerId];
    const partnerSocketId = getReceiverSocketId(partnerId);
    if (partnerSocketId) {
      io.to(partnerSocketId).emit("call:ended", { from: userId });
    }
  });

  // Real-time game move handler
  socket.on("game:move", async ({ gameId, moveData }) => {
    try {
      let game = await Game.findById(gameId);
      if (!game) return;

      game = gameEngine.processMove(game, userId, moveData);
      await game.save();

      if (game.status === "COMPLETED") {
        await Message.updateMany(
          { "gameData.gameId": game._id },
          {
            $set: {
              "gameData.status": "COMPLETED",
              "gameData.winner": game.winner,
              "gameData.winnerName": game.winnerName,
            },
          }
        );
      }

      const p1Socket = getReceiverSocketId(game.player1.userId.toString());
      const p2Socket = getReceiverSocketId(game.player2.userId.toString());

      if (p1Socket) io.to(p1Socket).emit("game:update", game);
      if (p2Socket) io.to(p2Socket).emit("game:update", game);
    } catch (error) {
      socket.emit("game:error", { message: error.message });
    }
  });

  // Disconnect handler
  socket.on("disconnect", async () => {
    console.log(`User disconnected: ${socket.user.fullName} (${userId})`);
    delete userSocketMap[userId];

    if (activeCalls[userId]) {
      const partnerId = activeCalls[userId].partnerId;
      delete activeCalls[userId];
      delete activeCalls[partnerId];
      const partnerSocketId = getReceiverSocketId(partnerId);
      if (partnerSocketId) {
        io.to(partnerSocketId).emit("call:ended", { from: userId });
      }
    }

    // Update lastSeen in database
    try {
      await User.findByIdAndUpdate(userId, { lastSeen: new Date() });
    } catch (err) {
      console.error("Error updating lastSeen:", err);
    }

    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

export { io, app, server };
