import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getCallHistory, logCall } from "../controllers/call.controller.js";

const router = express.Router();

router.use(protectRoute);

router.get("/history", getCallHistory);
router.post("/log", logCall);

export default router;
