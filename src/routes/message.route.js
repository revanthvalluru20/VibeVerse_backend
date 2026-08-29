import express from "express";
import {
  getAllContacts,
  getChatPartners,
  getMessagesByUserId,
  sendMessage,
  deleteMessage,
  markMessagesAsRead,
  blockUser,
  unblockUser,
} from "../controllers/message.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";

const router = express.Router();

router.use(protectRoute);

router.get("/contacts", getAllContacts);
router.get("/chats", getChatPartners);
router.get("/:id", getMessagesByUserId);
router.post("/mark-read/:id", markMessagesAsRead);
router.post("/send/:id", sendMessage);
router.delete("/:id", deleteMessage);

router.post("/block/:id", blockUser);
router.post("/unblock/:id", unblockUser);

export default router;
