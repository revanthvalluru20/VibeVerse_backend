import mongoose from "mongoose";

const communityMessageSchema = new mongoose.Schema(
  {
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Community",
      required: true,
      index: true,
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CommunityRoom",
      required: true,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["text", "image", "file", "poll", "announcement", "game_invite"],
      default: "text",
    },
    text: {
      type: String,
      trim: true,
      maxlength: 3000,
    },
    mediaUrl: {
      type: String,
    },
    pollData: {
      question: { type: String, trim: true },
      options: [
        {
          text: { type: String, trim: true },
          votes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
        },
      ],
      isClosed: { type: Boolean, default: false },
      createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    gameData: {
      gameType: { type: String },
      challengeText: { type: String },
    },
    announcement: {
      title: { type: String },
      isImportant: { type: Boolean, default: true },
    },
    reactions: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        emoji: { type: String },
      },
    ],
  },
  { timestamps: true }
);

communityMessageSchema.index({ roomId: 1, createdAt: -1 });

const CommunityMessage = mongoose.model("CommunityMessage", communityMessageSchema);

export default CommunityMessage;
