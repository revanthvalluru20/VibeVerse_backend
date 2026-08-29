import express from "express";
import { protectRoute } from "../middleware/auth.middleware.js";
import {
  createGameInvite,
  acceptGameInvite,
  declineGameInvite,
  respondGameInvite,
  getGame,
  makeMove,
} from "../controllers/game.controller.js";

const router = express.Router();

router.use(protectRoute);

router.post("/invite", createGameInvite);
router.post("/accept/:gameId", acceptGameInvite);
router.post("/decline/:gameId", declineGameInvite);
router.post("/cancel/:gameId", declineGameInvite);
router.post("/:gameId/respond", respondGameInvite);
router.post("/:gameId/cancel", declineGameInvite);
router.get("/:gameId", getGame);
router.post("/move/:gameId", makeMove);
router.post("/:gameId/move", makeMove);

export default router;
