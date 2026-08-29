import mongoose from "mongoose";

const gameScoreSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    gameType: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    score: {
      type: Number,
      default: 0,
      min: 0,
    },
    bestScore: {
      type: Number,
      default: 0,
      min: 0,
    },
    gamesPlayed: {
      type: Number,
      default: 1,
      min: 0,
    },
    lastPlayedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Unique compound index per user and gameType
gameScoreSchema.index({ userId: 1, gameType: 1 }, { unique: true });

const GameScore = mongoose.model("GameScore", gameScoreSchema);

export default GameScore;
