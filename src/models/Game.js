import mongoose from "mongoose";
import { GAME_TYPES } from "../constants/gameConstants.js";

const gameSchema = new mongoose.Schema(
  {
    gameType: {
      type: String,
      enum: [
        "tic-tac-toe",
        "ticTacToe",
        "rock-paper-scissors",
        "rockPaperScissors",
        "connect-four",
        "connectFour",
        "chess",
        "carrom",
        "ludo",
      ],
      required: true,
    },
    player1: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      fullName: { type: String, required: true },
      profilePic: { type: String, default: "" },
      symbol: { type: String, default: "" },
      choice: { type: String, default: "" },
      score: { type: Number, default: 0 },
    },
    player2: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      fullName: { type: String, required: true },
      profilePic: { type: String, default: "" },
      symbol: { type: String, default: "" },
      choice: { type: String, default: "" },
      score: { type: Number, default: 0 },
    },
    currentTurn: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    gameState: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    status: {
      type: String,
      enum: ["WAITING", "ACTIVE", "COMPLETED", "CANCELLED"],
      default: "WAITING",
    },
    winner: {
      type: mongoose.Schema.Types.Mixed, // ObjectId, "DRAW", or null
      default: null,
    },
    winnerName: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

const Game = mongoose.model("Game", gameSchema);

export default Game;
