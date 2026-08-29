import mongoose from "mongoose";

const communityRoomSchema = new mongoose.Schema(
  {
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Community",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 60,
    },
    description: {
      type: String,
      default: "",
      maxlength: 300,
    },
    icon: {
      type: String,
      default: "#",
    },
    type: {
      type: String,
      enum: ["TEXT", "ANNOUNCEMENT", "VOICE", "VIDEO"],
      default: "TEXT",
    },
    privacy: {
      type: String,
      enum: ["PUBLIC", "PRIVATE"],
      default: "PUBLIC",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

communityRoomSchema.index({ communityId: 1, name: 1 });

const CommunityRoom = mongoose.model("CommunityRoom", communityRoomSchema);

export default CommunityRoom;
