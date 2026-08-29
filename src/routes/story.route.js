import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  createStory,
  getStoriesFeed,
  getUserStories,
  getStoryById,
  deleteStory,
  viewStory,
} from "../controllers/story.controller.js";

const router = express.Router();

router.post("/", protectRoute, createStory);
router.get("/", protectRoute, getStoriesFeed);
router.get("/user/:userId", protectRoute, getUserStories);
router.get("/:id", protectRoute, getStoryById);
router.delete("/:id", protectRoute, deleteStory);
router.post("/:id/view", protectRoute, viewStory);

export default router;
