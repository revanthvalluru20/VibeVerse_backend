import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  searchUsers,
  getFriends,
  getFriendRequests,
  getSentFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  removeFriend,
} from "../controllers/friend.controller.js";

const router = express.Router();

router.use(protectRoute);

// Search users
router.get("/search", searchUsers);

// Friend requests and friendships
router.get("/", getFriends);
router.get("/requests", getFriendRequests);
router.get("/requests/sent", getSentFriendRequests);

router.post("/request", sendFriendRequest);
router.post("/request/:id/accept", acceptFriendRequest);
router.post("/request/:id/reject", rejectFriendRequest);
router.delete("/request/:id", cancelFriendRequest);

router.delete("/:id", removeFriend);

export default router;
