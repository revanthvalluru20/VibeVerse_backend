import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { searchUsers } from "../controllers/friend.controller.js";

const router = express.Router();

router.use(protectRoute);

router.get("/search", searchUsers);

export default router;
