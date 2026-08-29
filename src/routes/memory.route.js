import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  createMemory,
  getFeedPosts,
  getUserMemories,
  getMemoryById,
  reactToMemory,
  addComment,
  deleteComment,
  deleteMemory,
} from "../controllers/memory.controller.js";

const router = express.Router();

router.use(protectRoute);

router.post("/", createMemory);
router.get("/feed", getFeedPosts);
router.get("/user/:userId", getUserMemories);
router.get("/:id", getMemoryById);
router.delete("/:id", deleteMemory);
router.post("/:id/react", reactToMemory);
router.post("/:id/comment", addComment);
router.delete("/:id/comment/:commentId", deleteComment);

export default router;
