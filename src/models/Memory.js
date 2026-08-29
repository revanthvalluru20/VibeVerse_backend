import mongoose from "mongoose";

const memorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    caption: {
      type: String,
      default: "",
      trim: true,
      maxlength: 2000,
    },
    media: [
      {
        url: { type: String, required: true },
        type: { type: String, enum: ["image", "video"], default: "image" },
        caption: { type: String, default: "" },
      },
    ],
    date: {
      type: Date,
      default: Date.now,
    },
    location: {
      type: String,
      default: "",
      trim: true,
      maxlength: 100,
    },
    taggedFriends: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    privacy: {
      type: String,
      enum: ["FRIENDS_ONLY", "SELECTED_FRIENDS", "ONLY_ME"],
      default: "FRIENDS_ONLY",
      index: true,
    },
    selectedFriends: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    reactions: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        emoji: {
          type: String,
          default: "❤️",
        },
      },
    ],
    comments: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        text: {
          type: String,
          required: true,
          trim: true,
          maxlength: 500,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isFeedPost: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

memorySchema.index({ userId: 1, createdAt: -1 });

const Memory = mongoose.model("Memory", memorySchema);

export default Memory;
