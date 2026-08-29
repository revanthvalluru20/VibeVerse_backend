import Call from "../models/Call.js";
import User from "../models/User.js";

// 1. GET CALL HISTORY
export const getCallHistory = async (req, res) => {
  try {
    const userId = req.user._id;

    const calls = await Call.find({
      $or: [{ caller: userId }, { receiver: userId }],
    })
      .populate("caller", "fullName username profilePic")
      .populate("receiver", "fullName username profilePic")
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json(calls);
  } catch (error) {
    console.error("Error in getCallHistory:", error);
    res.status(500).json({ message: "Server error fetching call history" });
  }
};

// 2. LOG / UPDATE CALL
export const logCall = async (req, res) => {
  try {
    const callerId = req.user._id;
    const { receiverId, type = "VIDEO_CALL", status = "CONNECTED", duration = 0, startedAt, endedAt } = req.body;

    if (!receiverId) {
      return res.status(400).json({ message: "Receiver ID is required" });
    }

    const newCall = new Call({
      caller: callerId,
      receiver: receiverId,
      type,
      status,
      duration,
      startedAt: startedAt ? new Date(startedAt) : new Date(),
      endedAt: endedAt ? new Date(endedAt) : new Date(),
    });

    await newCall.save();
    await newCall.populate("caller", "fullName username profilePic");
    await newCall.populate("receiver", "fullName username profilePic");

    res.status(201).json(newCall);
  } catch (error) {
    console.error("Error in logCall:", error);
    res.status(500).json({ message: "Server error logging call" });
  }
};
