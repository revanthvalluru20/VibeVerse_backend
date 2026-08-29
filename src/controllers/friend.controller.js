import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";
import { getReceiverSocketId, io } from "../lib/socket.js";

// SEARCH USERS BY USERNAME OR FULL NAME OR GET SUGGESTED MEMBERS
export const searchUsers = async (req, res) => {
  try {
    const { username, query } = req.query;
    const searchTerm = (username || query || "").trim();
    const currentUser = req.user;
    const currentUserId = currentUser._id.toString();

    let filter = { _id: { $ne: currentUser._id } };

    if (searchTerm) {
      const escaped = searchTerm.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      filter.$or = [
        { username: { $regex: escaped, $options: "i" } },
        { fullName: { $regex: escaped, $options: "i" } },
        { email: { $regex: escaped, $options: "i" } },
      ];
    }

    // Find users (up to 30) - lean for pure fast JSON
    const users = await User.find(filter)
      .select("fullName username email profilePic lastSeen blockedUsers friends")
      .sort({ updatedAt: -1 })
      .limit(30)
      .lean();

    // Fetch all pending friend requests involving current user in one single batch query
    const pendingRequests = await FriendRequest.find({
      $or: [{ sender: currentUser._id }, { receiver: currentUser._id }],
      status: "PENDING",
    }).lean();

    // Index requests by user ID for instant O(1) lookup
    const sentMap = new Map(); // targetId -> requestId
    const receivedMap = new Map(); // targetId -> requestId

    for (const pr of pendingRequests) {
      const sId = pr.sender.toString();
      const rId = pr.receiver.toString();
      if (sId === currentUserId) {
        sentMap.set(rId, pr._id);
      } else if (rId === currentUserId) {
        receivedMap.set(sId, pr._id);
      }
    }

    const currentBlocked = (currentUser.blockedUsers || []).map((id) => id.toString());
    const currentFriends = (currentUser.friends || []).map((id) => id.toString());

    // Compute relationship in-memory
    const results = users.map((user) => {
      const targetId = user._id.toString();
      const targetBlocked = (user.blockedUsers || []).map((id) => id.toString());

      // Safe fallback username
      let displayUsername = user.username;
      if (!displayUsername) {
        const base = (user.fullName || (user.email ? user.email.split("@")[0] : "user"))
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, "")
          .slice(0, 15) || "user";
        displayUsername = base;
      }

      let status = "NONE";
      let requestId = null;

      if (currentBlocked.includes(targetId) || targetBlocked.includes(currentUserId)) {
        status = "BLOCKED";
      } else if (currentFriends.includes(targetId)) {
        status = "FRIENDS";
      } else if (sentMap.has(targetId)) {
        status = "PENDING_SENT";
        requestId = sentMap.get(targetId);
      } else if (receivedMap.has(targetId)) {
        status = "PENDING_RECEIVED";
        requestId = receivedMap.get(targetId);
      }

      return {
        _id: user._id,
        fullName: user.fullName,
        username: displayUsername,
        profilePic: user.profilePic || "",
        lastSeen: user.lastSeen,
        relationshipStatus: status,
        requestId,
      };
    });

    res.status(200).json(results);
  } catch (error) {
    console.error("Error in searchUsers:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// GET ALL ACCEPTED FRIENDS
export const getFriends = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: "friends",
      select: "fullName username profilePic lastSeen",
    });

    res.status(200).json(user?.friends || []);
  } catch (error) {
    console.error("Error in getFriends:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// GET INCOMING PENDING FRIEND REQUESTS
export const getFriendRequests = async (req, res) => {
  try {
    const requests = await FriendRequest.find({
      receiver: req.user._id,
      status: "PENDING",
    })
      .populate("sender", "fullName username profilePic lastSeen")
      .sort({ createdAt: -1 });

    res.status(200).json(requests);
  } catch (error) {
    console.error("Error in getFriendRequests:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// GET OUTGOING SENT FRIEND REQUESTS
export const getSentFriendRequests = async (req, res) => {
  try {
    const requests = await FriendRequest.find({
      sender: req.user._id,
      status: "PENDING",
    })
      .populate("receiver", "fullName username profilePic lastSeen")
      .sort({ createdAt: -1 });

    res.status(200).json(requests);
  } catch (error) {
    console.error("Error in getSentFriendRequests:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// SEND FRIEND REQUEST
export const sendFriendRequest = async (req, res) => {
  try {
    const { targetUserId, username } = req.body;
    const currentUserId = req.user._id;

    let targetUser;
    if (targetUserId) {
      targetUser = await User.findById(targetUserId);
    } else if (username) {
      targetUser = await User.findOne({ username: username.toLowerCase().trim() });
    }

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (targetUser._id.equals(currentUserId)) {
      return res.status(400).json({ message: "You cannot send a friend request to yourself" });
    }

    // Check if blocked
    if (req.user.blockedUsers && req.user.blockedUsers.includes(targetUser._id)) {
      return res.status(403).json({ message: "You have blocked this user" });
    }
    if (targetUser.blockedUsers && targetUser.blockedUsers.includes(currentUserId)) {
      return res.status(403).json({ message: "Cannot send request to this user" });
    }

    // Check if already friends
    if (req.user.friends && req.user.friends.includes(targetUser._id)) {
      return res.status(400).json({ message: "You are already friends with this user" });
    }

    // Check existing requests
    const existingSent = await FriendRequest.findOne({
      sender: currentUserId,
      receiver: targetUser._id,
      status: "PENDING",
    });

    if (existingSent) {
      return res.status(400).json({ message: "Friend request already sent" });
    }

    // If reverse request is already pending, accept it directly
    const existingReceived = await FriendRequest.findOne({
      sender: targetUser._id,
      receiver: currentUserId,
      status: "PENDING",
    });

    if (existingReceived) {
      existingReceived.status = "ACCEPTED";
      await existingReceived.save();

      await User.findByIdAndUpdate(currentUserId, { $addToSet: { friends: targetUser._id } });
      await User.findByIdAndUpdate(targetUser._id, { $addToSet: { friends: currentUserId } });

      const targetSocketId = getReceiverSocketId(targetUser._id.toString());
      if (targetSocketId) {
        io.to(targetSocketId).emit("friend:request:accepted", {
          requestId: existingReceived._id,
          senderId: targetUser._id.toString(),
          friend: {
            _id: req.user._id,
            fullName: req.user.fullName,
            username: req.user.username,
            profilePic: req.user.profilePic,
            lastSeen: req.user.lastSeen,
          },
        });
      }

      return res.status(200).json({
        message: `You and ${targetUser.fullName} are now friends!`,
        status: "FRIENDS",
        friend: targetUser,
      });
    }

    // Create new FriendRequest
    const newRequest = new FriendRequest({
      sender: currentUserId,
      receiver: targetUser._id,
      status: "PENDING",
    });

    await newRequest.save();

    // Populate sender info for real-time socket payload
    const populatedRequest = await FriendRequest.findById(newRequest._id).populate(
      "sender",
      "fullName username profilePic lastSeen"
    );

    const targetSocketId = getReceiverSocketId(targetUser._id.toString());
    if (targetSocketId) {
      io.to(targetSocketId).emit("friend:request", populatedRequest);
    }

    res.status(201).json({
      message: "Friend request sent successfully",
      status: "PENDING_SENT",
      requestId: newRequest._id,
    });
  } catch (error) {
    console.error("Error in sendFriendRequest:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ACCEPT FRIEND REQUEST
export const acceptFriendRequest = async (req, res) => {
  try {
    const { id: requestId } = req.params;
    const currentUserId = req.user._id;

    const request = await FriendRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Friend request not found" });
    }

    if (request.receiver.toString() !== currentUserId.toString()) {
      return res.status(403).json({ message: "Unauthorized to accept this request" });
    }

    if (request.status !== "PENDING") {
      return res.status(400).json({ message: `Request is already ${request.status.toLowerCase()}` });
    }

    request.status = "ACCEPTED";
    await request.save();

    // Add each user to the other's friends array
    await User.findByIdAndUpdate(currentUserId, { $addToSet: { friends: request.sender } });
    await User.findByIdAndUpdate(request.sender, { $addToSet: { friends: currentUserId } });

    const senderUser = await User.findById(request.sender).select("fullName username profilePic lastSeen");

    // Real-time socket notification to sender
    const senderSocketId = getReceiverSocketId(request.sender.toString());
    if (senderSocketId) {
      io.to(senderSocketId).emit("friend:request:accepted", {
        requestId: request._id,
        senderId: request.sender.toString(),
        friend: {
          _id: req.user._id,
          fullName: req.user.fullName,
          username: req.user.username,
          profilePic: req.user.profilePic,
          lastSeen: req.user.lastSeen,
        },
      });
    }

    res.status(200).json({
      message: "Friend request accepted",
      friend: senderUser,
    });
  } catch (error) {
    console.error("Error in acceptFriendRequest:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// REJECT FRIEND REQUEST
export const rejectFriendRequest = async (req, res) => {
  try {
    const { id: requestId } = req.params;
    const currentUserId = req.user._id;

    const request = await FriendRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Friend request not found" });
    }

    if (request.receiver.toString() !== currentUserId.toString()) {
      return res.status(403).json({ message: "Unauthorized to reject this request" });
    }

    request.status = "REJECTED";
    await request.save();

    const senderSocketId = getReceiverSocketId(request.sender.toString());
    if (senderSocketId) {
      io.to(senderSocketId).emit("friend:request:rejected", {
        requestId: request._id,
        senderId: request.sender.toString(),
        receiverId: request.receiver.toString(),
      });
    }

    res.status(200).json({ message: "Friend request rejected" });
  } catch (error) {
    console.error("Error in rejectFriendRequest:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// CANCEL OUTGOING FRIEND REQUEST
export const cancelFriendRequest = async (req, res) => {
  try {
    const { id: requestId } = req.params;
    const currentUserId = req.user._id;

    const request = await FriendRequest.findById(requestId);
    if (!request) {
      return res.status(404).json({ message: "Friend request not found" });
    }

    if (request.sender.toString() !== currentUserId.toString()) {
      return res.status(403).json({ message: "Unauthorized to cancel this request" });
    }

    request.status = "CANCELLED";
    await request.save();

    const receiverSocketId = getReceiverSocketId(request.receiver.toString());
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("friend:request:cancelled", {
        requestId: request._id,
        senderId: request.sender.toString(),
        receiverId: request.receiver.toString(),
      });
    }

    res.status(200).json({ message: "Friend request cancelled" });
  } catch (error) {
    console.error("Error in cancelFriendRequest:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// REMOVE FRIEND
export const removeFriend = async (req, res) => {
  try {
    const { id: friendId } = req.params;
    const currentUserId = req.user._id;

    await User.findByIdAndUpdate(currentUserId, { $pull: { friends: friendId } });
    await User.findByIdAndUpdate(friendId, { $pull: { friends: currentUserId } });

    // Update any accepted friend request record to cancelled
    await FriendRequest.updateMany(
      {
        $or: [
          { sender: currentUserId, receiver: friendId, status: "ACCEPTED" },
          { sender: friendId, receiver: currentUserId, status: "ACCEPTED" },
        ],
      },
      { $set: { status: "CANCELLED" } }
    );

    const friendSocketId = getReceiverSocketId(friendId.toString());
    if (friendSocketId) {
      io.to(friendSocketId).emit("friend:removed", { userId: currentUserId.toString() });
    }

    res.status(200).json({ message: "Friend removed successfully", friendId });
  } catch (error) {
    console.error("Error in removeFriend:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
