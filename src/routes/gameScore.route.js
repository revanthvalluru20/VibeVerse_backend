import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  getMyScores,
  getScoreByGame,
  saveScore,
} from "../controllers/gameScore.controller.js";

const router = express.Router();

router.get("/", protectRoute, getMyScores);
router.get("/:gameType", protectRoute, getScoreByGame);
router.post("/", protectRoute, saveScore);

export default router;
