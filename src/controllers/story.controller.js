import Story from "../models/Story.js";
import User from "../models/User.js";
import cloudinary from "../lib/cloudinary.js";

// 1. CREATE STORY
export const createStory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { media, mediaType = "image", caption = "" } = req.body;

    if (!media) {
      return res.status(400).json({ message: "Media content (image or video) is required" });
    }

    if (!["image", "video"].includes(mediaType)) {
      return res.status(400).json({ message: "Invalid media type. Must be 'image' or 'video'" });
    }

    let mediaUrl = media;

    // If media is a base64 payload, upload to Cloudinary
    if (media.startsWith("data:")) {
      try {
        const uploadOptions = {
          folder: "VibeVerse_stories",
          resource_type: mediaType === "video" ? "video" : "image",
        };
        const uploadRes = await cloudinary.uploader.upload(media, uploadOptions);
        mediaUrl = uploadRes.secure_url;
      } catch (uploadErr) {
        console.error("Cloudinary story upload error:", uploadErr.message);
        // Fallback: If Cloudinary fails/not configured, store directly if size permits
        if (media.length > 5 * 1024 * 1024) {
          return res.status(400).json({ message: "File too large to process without cloud storage" });
        }
        mediaUrl = media;
      }
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    const newStory = new Story({
      userId,
      mediaUrl,
      mediaType,
      caption: caption ? caption.trim().slice(0, 300) : "",
      createdAt: now,
      expiresAt,
      viewers: [],
    });

    await newStory.save();
    await newStory.populate("userId", "fullName username profilePic");

    res.status(201).json(newStory);
  } catch (error) {
    console.error("Error in createStory controller:", error);
    res.status(500).json({ message: "Server error creating story" });
  }
};

// 2. GET ACTIVE STORIES FEED (User's own stories + Friends' stories)
export const getStoriesFeed = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const currentUser = await User.findById(loggedInUserId);
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const friendsList = currentUser.friends || [];
    const allowedUserIds = [loggedInUserId, ...friendsList];
    const now = new Date();

    // Query active stories within the 24-hour window
    const activeStories = await Story.find({
      userId: { $in: allowedUserIds },
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: 1 })
      .populate("userId", "fullName username profilePic")
      .populate("viewers.userId", "fullName username profilePic");

    // Group stories by User
    const storiesByUser = {};

    activeStories.forEach((story) => {
      if (!story.userId) return;
      const uid = story.userId._id.toString();
      if (!storiesByUser[uid]) {
        storiesByUser[uid] = {
          user: story.userId,
          isMe: uid === loggedInUserId.toString(),
          stories: [],
          allViewed: true,
          latestCreatedAt: story.createdAt,
        };
      }

      // Check if logged-in user has viewed this particular story
      const hasViewed = story.viewers.some(
        (v) => v.userId && v.userId._id.toString() === loggedInUserId.toString()
      );

      if (!hasViewed && uid !== loggedInUserId.toString()) {
        storiesByUser[uid].allViewed = false;
      }

      storiesByUser[uid].stories.push({
        _id: story._id,
        mediaUrl: story.mediaUrl,
        mediaType: story.mediaType,
        caption: story.caption,
        createdAt: story.createdAt,
        expiresAt: story.expiresAt,
        hasViewed,
        viewersCount: story.viewers.length,
        // Expose viewer list only to the story owner
        viewers: uid === loggedInUserId.toString() ? story.viewers : undefined,
      });

      if (new Date(story.createdAt) > new Date(storiesByUser[uid].latestCreatedAt)) {
        storiesByUser[uid].latestCreatedAt = story.createdAt;
      }
    });

    const feedArray = Object.values(storiesByUser).sort((a, b) => {
      // Put user's own story group first
      if (a.isMe) return -1;
      if (b.isMe) return 1;
      // Then unviewed friend stories before viewed
      if (!a.allViewed && b.allViewed) return -1;
      if (a.allViewed && !b.allViewed) return 1;
      // Sort by newest story
      return new Date(b.latestCreatedAt) - new Date(a.latestCreatedAt);
    });

    res.status(200).json(feedArray);
  } catch (error) {
    console.error("Error in getStoriesFeed controller:", error);
    res.status(500).json({ message: "Server error fetching stories" });
  }
};

// 3. GET ACTIVE STORIES OF A SPECIFIC USER
export const getUserStories = async (req, res) => {
  try {
    const { userId } = req.params;
    const loggedInUserId = req.user._id;

    // Check friendship or self
    const currentUser = await User.findById(loggedInUserId);
    const isFriendOrSelf =
      loggedInUserId.toString() === userId.toString() ||
      (currentUser.friends && currentUser.friends.some((f) => f.toString() === userId.toString()));

    if (!isFriendOrSelf) {
      return res.status(403).json({ message: "You can only view stories of your friends" });
    }

    const now = new Date();
    const stories = await Story.find({
      userId,
      expiresAt: { $gt: now },
    })
      .sort({ createdAt: 1 })
      .populate("userId", "fullName username profilePic")
      .populate("viewers.userId", "fullName username profilePic");

    res.status(200).json(stories);
  } catch (error) {
    console.error("Error in getUserStories controller:", error);
    res.status(500).json({ message: "Server error fetching user stories" });
  }
};

// 4. GET SINGLE STORY DETAILS
export const getStoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const now = new Date();

    const story = await Story.findOne({ _id: id, expiresAt: { $gt: now } })
      .populate("userId", "fullName username profilePic")
      .populate("viewers.userId", "fullName username profilePic");

    if (!story) {
      return res.status(404).json({ message: "Story not found or expired" });
    }

    res.status(200).json(story);
  } catch (error) {
    console.error("Error in getStoryById controller:", error);
    res.status(500).json({ message: "Server error fetching story" });
  }
};

// 5. MARK STORY AS VIEWED
export const viewStory = async (req, res) => {
  try {
    const { id } = req.params;
    const loggedInUserId = req.user._id;
    const now = new Date();

    const story = await Story.findOne({ _id: id, expiresAt: { $gt: now } });
    if (!story) {
      return res.status(404).json({ message: "Story not found or expired" });
    }

    // Do not add duplicate view
    const alreadyViewed = story.viewers.some(
      (v) => v.userId && v.userId.toString() === loggedInUserId.toString()
    );

    if (!alreadyViewed && story.userId.toString() !== loggedInUserId.toString()) {
      story.viewers.push({ userId: loggedInUserId, viewedAt: new Date() });
      await story.save();
    }

    res.status(200).json({ message: "Story viewed", storyId: id, viewersCount: story.viewers.length });
  } catch (error) {
    console.error("Error in viewStory controller:", error);
    res.status(500).json({ message: "Server error marking story as viewed" });
  }
};

// 6. DELETE STORY (Owner only)
export const deleteStory = async (req, res) => {
  try {
    const { id } = req.params;
    const loggedInUserId = req.user._id;

    const story = await Story.findById(id);
    if (!story) {
      return res.status(404).json({ message: "Story not found" });
    }

    if (story.userId.toString() !== loggedInUserId.toString()) {
      return res.status(403).json({ message: "Unauthorized. You can only delete your own stories" });
    }

    await Story.findByIdAndDelete(id);

    res.status(200).json({ message: "Story deleted successfully", storyId: id });
  } catch (error) {
    console.error("Error in deleteStory controller:", error);
    res.status(500).json({ message: "Server error deleting story" });
  }
};
