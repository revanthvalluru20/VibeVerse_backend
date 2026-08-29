import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getCommunities,
  createCommunity,
  getCommunityDetails,
  joinCommunity,
  leaveCommunity,
  updateCommunity,
  deleteCommunity,
  updateMemberRole,
  kickMember,
  inviteFriend,
  createRoom,
  deleteRoom,
  getRoomMessages,
  sendRoomMessage,
  votePoll,
  closePoll,
} from "../controllers/community.controller.js";

const router = express.Router();

router.use(protectRoute);

router.get("/", getCommunities);
router.post("/", createCommunity);
router.get("/:id", getCommunityDetails);
router.put("/:id", updateCommunity);
router.delete("/:id", deleteCommunity);

router.post("/:id/join", joinCommunity);
router.post("/:id/leave", leaveCommunity);
router.post("/:id/invite", inviteFriend);
router.put("/:id/members/:targetUserId/role", updateMemberRole);
router.delete("/:id/members/:targetUserId", kickMember);

router.post("/:id/rooms", createRoom);
router.delete("/rooms/:roomId", deleteRoom);

router.get("/rooms/:roomId/messages", getRoomMessages);
router.post("/rooms/:roomId/messages", sendRoomMessage);
router.post("/rooms/messages/:messageId/vote", votePoll);
router.post("/rooms/messages/:messageId/close-poll", closePoll);

export default router;
