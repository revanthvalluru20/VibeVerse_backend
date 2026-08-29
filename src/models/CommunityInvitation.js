import mongoose from "mongoose";

const communityInvitationSchema = new mongoose.Schema(
  {
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Community",
      required: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "DECLINED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

communityInvitationSchema.index({ communityId: 1, receiver: 1, status: 1 });

const CommunityInvitation = mongoose.model("CommunityInvitation", communityInvitationSchema);

export default CommunityInvitation;
