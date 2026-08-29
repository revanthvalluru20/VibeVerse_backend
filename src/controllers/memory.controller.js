import Memory from "../models/Memory.js";
import User from "../models/User.js";
import cloudinary from "../lib/cloudinary.js";

// 1. CREATE MEMORY / FEED POST
export const createMemory = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      caption = "",
      media = [], // [{ url, type }] or base64 strings
      date,
      location = "",
      taggedFriends = [],
      privacy = "FRIENDS_ONLY",
      selectedFriends = [],
      isFeedPost = true,
    } = req.body;

    if (!caption && (!media || media.length === 0)) {
      return res.status(400).json({ message: "Memory content (text or media) is required" });
    }

    const processedMedia = [];

    if (Array.isArray(media)) {
      for (const item of media) {
        let mediaUrl = typeof item === "string" ? item : item.url;
        const mediaType = typeof item === "object" && item.type ? item.type : "image";

        if (mediaUrl && mediaUrl.startsWith("data:")) {
          try {
            const uploadRes = await cloudinary.uploader.upload(mediaUrl, {
              folder: "VibeVerse_memories",
              resource_type: mediaType === "video" ? "video" : "image",
            });
            mediaUrl = uploadRes.secure_url;
          } catch (uploadErr) {
            console.error("Cloudinary upload error:", uploadErr.message);
          }
        }

        if (mediaUrl) {
          processedMedia.push({
            url: mediaUrl,
            type: mediaType,
            caption: typeof item === "object" && item.caption ? item.caption : "",
          });
        }
      }
    }

    const newMemory = new Memory({
      userId,
      caption: caption ? caption.trim() : "",
      media: processedMedia,
      date: date ? new Date(date) : new Date(),
      location: location ? location.trim() : "",
      taggedFriends,
      privacy,
      selectedFriends,
      isFeedPost,
    });

    await newMemory.save();
    await newMemory.populate("userId", "fullName username profilePic");
    await newMemory.populate("taggedFriends", "fullName username profilePic");

    res.status(201).json(newMemory);
  } catch (error) {
    console.error("Error in createMemory:", error);
    res.status(500).json({ message: "Server error creating memory" });
  }
};

// 2. GET FRIENDS FEED (Friends Posts + Own Posts)
export const getFeedPosts = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const currentUser = await User.findById(loggedInUserId);
    if (!currentUser) return res.status(404).json({ message: "User not found" });

    const friendsList = currentUser.friends || [];
    const { page = 1, limit = 20 } = req.query;

    const query = {
      $or: [
        { userId: loggedInUserId },
        {
          userId: { $in: friendsList },
          privacy: "FRIENDS_ONLY",
        },
        {
          userId: { $in: friendsList },
          privacy: "SELECTED_FRIENDS",
          selectedFriends: loggedInUserId,
        },
      ],
    };

    const posts = await Memory.find(query)
      .populate("userId", "fullName username profilePic")
      .populate("taggedFriends", "fullName username profilePic")
      .populate("comments.userId", "fullName username profilePic")
      .populate("reactions.userId", "fullName username profilePic")
      .sort({ createdAt: -1 })
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit));

    res.status(200).json(posts);
  } catch (error) {
    console.error("Error in getFeedPosts:", error);
    res.status(500).json({ message: "Server error fetching feed" });
  }
};

// 3. GET USER MEMORIES (For Profile / Memories Grid)
export const getUserMemories = async (req, res) => {
  try {
    const { userId } = req.params;
    const loggedInUserId = req.user._id;

    const isMe = loggedInUserId.toString() === userId.toString();
    const currentUser = await User.findById(loggedInUserId);
    const isFriend = currentUser?.friends?.some((f) => f.toString() === userId.toString());

    let query = { userId };

    if (!isMe) {
      if (!isFriend) {
        return res.status(403).json({ message: "You can only view memories of your friends." });
      }
      query = {
        userId,
        $or: [
          { privacy: "FRIENDS_ONLY" },
          { privacy: "SELECTED_FRIENDS", selectedFriends: loggedInUserId },
        ],
      };
    }

    const memories = await Memory.find(query)
      .populate("userId", "fullName username profilePic")
      .populate("taggedFriends", "fullName username profilePic")
      .populate("comments.userId", "fullName username profilePic")
      .sort({ date: -1, createdAt: -1 });

    res.status(200).json(memories);
  } catch (error) {
    console.error("Error in getUserMemories:", error);
    res.status(500).json({ message: "Server error fetching memories" });
  }
};

// 4. GET SINGLE MEMORY
export const getMemoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const loggedInUserId = req.user._id;

    const memory = await Memory.findById(id)
      .populate("userId", "fullName username profilePic")
      .populate("taggedFriends", "fullName username profilePic")
      .populate("comments.userId", "fullName username profilePic")
      .populate("reactions.userId", "fullName username profilePic");

    if (!memory) return res.status(404).json({ message: "Memory not found" });

    // Check privacy
    const isMe = memory.userId._id.toString() === loggedInUserId.toString();
    if (!isMe) {
      const currentUser = await User.findById(loggedInUserId);
      const isFriend = currentUser?.friends?.some((f) => f.toString() === memory.userId._id.toString());
      if (!isFriend && memory.privacy !== "FRIENDS_ONLY") {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    res.status(200).json(memory);
  } catch (error) {
    console.error("Error in getMemoryById:", error);
    res.status(500).json({ message: "Server error fetching memory" });
  }
};

// 5. REACT TO MEMORY
export const reactToMemory = async (req, res) => {
  try {
    const { id } = req.params;
    const { emoji = "❤️" } = req.body;
    const userId = req.user._id;

    const memory = await Memory.findById(id);
    if (!memory) return res.status(404).json({ message: "Memory not found" });

    const existingIndex = memory.reactions.findIndex((r) => r.userId.toString() === userId.toString());

    if (existingIndex > -1) {
      if (memory.reactions[existingIndex].emoji === emoji) {
        // Toggle remove reaction
        memory.reactions.splice(existingIndex, 1);
      } else {
        // Change reaction emoji
        memory.reactions[existingIndex].emoji = emoji;
      }
    } else {
      memory.reactions.push({ userId, emoji });
    }

    await memory.save();
    await memory.populate("reactions.userId", "fullName username profilePic");

    res.status(200).json(memory.reactions);
  } catch (error) {
    console.error("Error in reactToMemory:", error);
    res.status(500).json({ message: "Server error reacting to memory" });
  }
};

// 6. ADD COMMENT
export const addComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const userId = req.user._id;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    const memory = await Memory.findById(id);
    if (!memory) return res.status(404).json({ message: "Memory not found" });

    const comment = {
      userId,
      text: text.trim(),
      createdAt: new Date(),
    };

    memory.comments.push(comment);
    await memory.save();
    await memory.populate("comments.userId", "fullName username profilePic");

    res.status(201).json(memory.comments);
  } catch (error) {
    console.error("Error in addComment:", error);
    res.status(500).json({ message: "Server error adding comment" });
  }
};

// 7. DELETE COMMENT
export const deleteComment = async (req, res) => {
  try {
    const { id, commentId } = req.params;
    const userId = req.user._id;

    const memory = await Memory.findById(id);
    if (!memory) return res.status(404).json({ message: "Memory not found" });

    const comment = memory.comments.id(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    const isCommentAuthor = comment.userId.toString() === userId.toString();
    const isMemoryOwner = memory.userId.toString() === userId.toString();

    if (!isCommentAuthor && !isMemoryOwner) {
      return res.status(403).json({ message: "Unauthorized to delete this comment" });
    }

    memory.comments.pull(commentId);
    await memory.save();

    res.status(200).json({ message: "Comment deleted", comments: memory.comments });
  } catch (error) {
    console.error("Error in deleteComment:", error);
    res.status(500).json({ message: "Server error deleting comment" });
  }
};

// 8. DELETE MEMORY (Owner only)
export const deleteMemory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const memory = await Memory.findById(id);
    if (!memory) return res.status(404).json({ message: "Memory not found" });

    if (memory.userId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Unauthorized to delete this memory" });
    }

    await Memory.findByIdAndDelete(id);
    res.status(200).json({ message: "Memory deleted successfully", memoryId: id });
  } catch (error) {
    console.error("Error in deleteMemory:", error);
    res.status(500).json({ message: "Server error deleting memory" });
  }
};
