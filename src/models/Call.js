import mongoose from "mongoose";

const callSchema = new mongoose.Schema(
  {
    caller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["VOICE_CALL", "VIDEO_CALL"],
      default: "VIDEO_CALL",
    },
    status: {
      type: String,
      enum: [
        "RINGING",
        "ACCEPTED",
        "CONNECTED",
        "DECLINED",
        "MISSED",
        "CANCELLED",
        "ENDED",
        "BUSY",
        "FAILED",
      ],
      default: "RINGING",
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    connectedAt: {
      type: Date,
    },
    endedAt: {
      type: Date,
    },
    duration: {
      type: Number, // duration in seconds
      default: 0,
    },
  },
  { timestamps: true }
);

callSchema.index({ caller: 1, receiver: 1, createdAt: -1 });

const Call = mongoose.model("Call", callSchema);

export default Call;
