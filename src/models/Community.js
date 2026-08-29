import mongoose from "mongoose";

const communitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
      index: true,
    },
    description: {
      type: String,
      default: "",
      maxlength: 1000,
    },
    category: {
      type: String,
      default: "General",
      enum: [
        "General",
        "Technology",
        "Gaming",
        "Sports",
        "Education",
        "Entertainment",
        "Music",
        "Art & Design",
        "Lifestyle",
      ],
      index: true,
    },
    profileImage: {
      type: String,
      default: "",
    },
    coverImage: {
      type: String,
      default: "",
    },
    icon: {
      type: String,
      default: "🏛️",
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    admins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    moderators: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    members: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        role: {
          type: String,
          enum: ["OWNER", "ADMIN", "MODERATOR", "MEMBER"],
          default: "MEMBER",
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    bannedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    privacy: {
      type: String,
      enum: ["PUBLIC", "PRIVATE"],
      default: "PUBLIC",
      index: true,
    },
    rules: {
      type: String,
      default: "1. Be respectful\n2. No spam\n3. Stay on topic",
    },
    isDefaultSeed: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

communitySchema.index({ name: "text", description: "text" });

const Community = mongoose.model("Community", communitySchema);

export default Community;
