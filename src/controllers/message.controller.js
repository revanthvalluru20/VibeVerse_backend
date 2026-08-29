import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import FriendRequest from "../models/FriendRequest.js";

export const getAllContacts = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const currentUser = await User.findById(loggedInUserId);

    const blockedList = currentUser.blockedUsers || [];

    const filteredUsers = await User.find({
      _id: { $ne: loggedInUserId, $nin: blockedList },
      emailVerified: true,
    }).select("-password");

    // Compute relationship for each contact
    const contactsWithStatus = await Promise.all(
      filteredUsers.map(async (contact) => {
        const contactId = contact._id.toString();
        let status = "NONE";
        let requestId = null;

        if (currentUser.friends && currentUser.friends.some((f) => f.toString() === contactId)) {
          status = "FRIENDS";
        } else {
          const reqDoc = await FriendRequest.findOne({
            $or: [
              { sender: loggedInUserId, receiver: contact._id, status: "PENDING" },
              { sender: contact._id, receiver: loggedInUserId, status: "PENDING" },
            ],
          });
          if (reqDoc) {
            if (reqDoc.sender.toString() === loggedInUserId.toString()) {
              status = "PENDING_SENT";
            } else {
              status = "PENDING_RECEIVED";
            }
            requestId = reqDoc._id;
          }
        }

        return {
          _id: contact._id,
          fullName: contact.fullName,
          username: contact.username || "",
          profilePic: contact.profilePic || "",
          lastSeen: contact.lastSeen,
          relationshipStatus: status,
          requestId,
        };
      })
    );

    res.status(200).json(contactsWithStatus);
  } catch (error) {
    console.log("Error in getAllContacts:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const getMessagesByUserId = async (req, res) => {
  try {
    const myId = req.user._id;
    const { id: userToChatId } = req.params;

    // 1. Mark unread messages sent by userToChatId as 'read' FIRST
    const updateResult = await Message.updateMany(
      { senderId: userToChatId, receiverId: myId, status: { $ne: "read" } },
      { $set: { status: "read" } }
    );

    // 2. Real-time notification to sender that messages were read
    if (updateResult.modifiedCount > 0) {
      const senderSocketId = getReceiverSocketId(userToChatId.toString());
      if (senderSocketId) {
        io.to(senderSocketId).emit("message:read", {
          readerId: myId.toString(),
          senderId: userToChatId.toString(),
        });
      }
    }

    // 3. Find messages (with updated read status)
    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    }).sort({ createdAt: 1 });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const markMessagesAsRead = async (req, res) => {
  try {
    const myId = req.user._id;
    const { id: userToChatId } = req.params;

    const result = await Message.updateMany(
      { senderId: userToChatId, receiverId: myId, status: { $ne: "read" } },
      { $set: { status: "read" } }
    );

    const senderSocketId = getReceiverSocketId(userToChatId.toString());
    if (senderSocketId) {
      io.to(senderSocketId).emit("message:read", {
        readerId: myId.toString(),
        senderId: userToChatId.toString(),
      });
    }

    res.status(200).json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error("Error in markMessagesAsRead:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image, voice, type = "text", duration } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    if (!text && !image && !voice && type === "text") {
      return res.status(400).json({ message: "Message content is required." });
    }

    if (senderId.equals(receiverId)) {
      return res.status(400).json({ message: "Cannot send messages to yourself." });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: "Receiver not found." });
    }

    // Check if sender is blocked by receiver
    if (receiver.blockedUsers && receiver.blockedUsers.includes(senderId)) {
      return res.status(403).json({ message: "You cannot send messages to this user." });
    }

    // ENFORCE FRIENDSHIP ACCESS CONTROL: Users must be friends before chatting
    const sender = await User.findById(senderId);
    const isFriend = sender.friends && sender.friends.some((f) => f.toString() === receiverId.toString());

    if (!isFriend) {
      return res.status(403).json({
        success: false,
        message: "You must be friends before starting a chat.",
      });
    }

    let imageUrl = "";
    let mediaUrl = "";
    let messageType = type;

    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
      messageType = "image";
    }

    if (voice) {
      const uploadResponse = await cloudinary.uploader.upload(voice, {
        resource_type: "video",
        folder: "voice_messages",
      });
      mediaUrl = uploadResponse.secure_url;
      messageType = "voice";
    }

    const receiverSocketId = getReceiverSocketId(receiverId.toString());
    const initialStatus = receiverSocketId ? "delivered" : "sent";

    const newMessage = new Message({
      senderId,
      receiverId,
      type: messageType,
      text: text ? text.trim() : "",
      image: imageUrl,
      mediaUrl,
      duration: duration || null,
      status: initialStatus,
    });

    await newMessage.save();

    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.error("Error in sendMessage controller:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getChatPartners = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const currentUser = await User.findById(loggedInUserId);
    const friendsList = (currentUser?.friends || []).map((f) => f.toString());

    const messages = await Message.find({
      $or: [{ senderId: loggedInUserId }, { receiverId: loggedInUserId }],
    }).sort({ createdAt: -1 });

    const messagePartnerIds = messages.map((msg) =>
      msg.senderId.toString() === loggedInUserId.toString()
        ? msg.receiverId.toString()
        : msg.senderId.toString()
    );

    // Combine users from messages and user's friends
    const allPartnerIds = [...new Set([...messagePartnerIds, ...friendsList])];

    const users = await User.find({
      _id: { $in: allPartnerIds },
    }).select("-password");

    const chatPartners = allPartnerIds
      .map((partnerId) => {
        const user = users.find((u) => u._id.toString() === partnerId);
        if (!user) return null;

        const partnerMessages = messages.filter(
          (m) =>
            (m.senderId.toString() === partnerId && m.receiverId.toString() === loggedInUserId.toString()) ||
            (m.senderId.toString() === loggedInUserId.toString() && m.receiverId.toString() === partnerId)
        );

        const latestMsg = partnerMessages[0] || null;
        const unreadCount = messages.filter(
          (m) =>
            m.senderId.toString() === partnerId &&
            m.receiverId.toString() === loggedInUserId.toString() &&
            m.status !== "read"
        ).length;

        return {
          _id: user._id,
          fullName: user.fullName,
          username: user.username || "",
          profilePic: user.profilePic || "",
          lastSeen: user.lastSeen,
          lastMessage: latestMsg
            ? {
                _id: latestMsg._id,
                text: latestMsg.text,
                type: latestMsg.type,
                image: latestMsg.image,
                senderId: latestMsg.senderId,
                status: latestMsg.status,
                createdAt: latestMsg.createdAt,
              }
            : null,
          unreadCount,
        };
      })
      .filter(Boolean);

    // Sort: chats with recent messages first, then friends without messages
    chatPartners.sort((a, b) => {
      if (a.lastMessage && b.lastMessage) {
        return new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt);
      }
      if (a.lastMessage) return -1;
      if (b.lastMessage) return 1;
      return a.fullName.localeCompare(b.fullName);
    });

    res.status(200).json(chatPartners);
  } catch (error) {
    console.error("Error in getChatPartners: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ message: "Message not found" });

    if (message.senderId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "You can only delete messages sent by you" });
    }

    await Message.findByIdAndDelete(messageId);

    const receiverSocketId = getReceiverSocketId(message.receiverId.toString());
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("message:deleted", { messageId });
    }

    res.status(200).json({ message: "Message deleted successfully", messageId });
  } catch (error) {
    console.error("Error in deleteMessage:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const blockUser = async (req, res) => {
  try {
    const { id: targetUserId } = req.params;
    const userId = req.user._id;

    if (userId.toString() === targetUserId) {
      return res.status(400).json({ message: "You cannot block yourself" });
    }

    // Also remove from friends if blocking
    await User.findByIdAndUpdate(userId, {
      $addToSet: { blockedUsers: targetUserId },
      $pull: { friends: targetUserId },
    });

    await User.findByIdAndUpdate(targetUserId, {
      $pull: { friends: userId },
    });

    res.status(200).json({ message: "User blocked successfully" });
  } catch (error) {
    console.error("Error in blockUser:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const unblockUser = async (req, res) => {
  try {
    const { id: targetUserId } = req.params;
    const userId = req.user._id;

    await User.findByIdAndUpdate(userId, {
      $pull: { blockedUsers: targetUserId },
    });

    res.status(200).json({ message: "User unblocked successfully" });
  } catch (error) {
    console.error("Error in unblockUser:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
