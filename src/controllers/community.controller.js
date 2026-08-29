import Community from "../models/Community.js";
import CommunityRoom from "../models/CommunityRoom.js";
import CommunityMessage from "../models/CommunityMessage.js";
import CommunityInvitation from "../models/CommunityInvitation.js";
import User from "../models/User.js";
import cloudinary from "../lib/cloudinary.js";
import { io } from "../lib/socket.js";

// SEED INITIAL 5 COMMUNITIES
export const seedDefaultCommunities = async (adminUserId) => {
  try {
    const count = await Community.countDocuments({ isDefaultSeed: true });
    if (count > 0) return;

    let systemUser = adminUserId ? await User.findById(adminUserId) : null;
    if (!systemUser) {
      systemUser = await User.findOne();
    }
    if (!systemUser) return;

    const defaultCommunities = [
      {
        name: "Developers",
        description: "Programming, software development and technology discussions.",
        category: "Technology",
        icon: "💻",
        rooms: [
          { name: "General", icon: "💬" },
          { name: "Web Development", icon: "🌐" },
          { name: "AI & Machine Learning", icon: "🤖" },
          { name: "Mobile Development", icon: "📱" },
          { name: "Jobs & Careers", icon: "💼" },
        ],
      },
      {
        name: "Cricket Fans",
        description: "Discuss cricket, matches, players and tournaments.",
        category: "Sports",
        icon: "🏏",
        rooms: [
          { name: "General", icon: "💬" },
          { name: "Match Discussion", icon: "🏏" },
          { name: "IPL", icon: "🏆" },
          { name: "International Cricket", icon: "🌍" },
          { name: "Predictions", icon: "🎯" },
        ],
      },
      {
        name: "Students",
        description: "Students can discuss education, exams, college life and careers.",
        category: "Education",
        icon: "🎓",
        rooms: [
          { name: "General", icon: "💬" },
          { name: "Study", icon: "📚" },
          { name: "Exams", icon: "📝" },
          { name: "College Life", icon: "🏫" },
          { name: "Careers", icon: "🚀" },
        ],
      },
      {
        name: "Movies & Entertainment",
        description: "Discuss movies, web series, actors and entertainment.",
        category: "Entertainment",
        icon: "🎬",
        rooms: [
          { name: "General", icon: "💬" },
          { name: "Movie Discussions", icon: "🍿" },
          { name: "Reviews", icon: "⭐" },
          { name: "Recommendations", icon: "💡" },
          { name: "Web Series", icon: "📺" },
        ],
      },
      {
        name: "Music & Creators",
        description: "Music, artists, creators and creative work.",
        category: "Music",
        icon: "🎵",
        rooms: [
          { name: "General", icon: "💬" },
          { name: "Songs", icon: "🎶" },
          { name: "Artists", icon: "🎤" },
          { name: "Covers", icon: "🎸" },
          { name: "Creativity", icon: "✨" },
        ],
      },
    ];

    for (const data of defaultCommunities) {
      const comm = new Community({
        name: data.name,
        description: data.description,
        category: data.category,
        icon: data.icon,
        owner: systemUser._id,
        admins: [systemUser._id],
        members: [{ user: systemUser._id, role: "OWNER" }],
        privacy: "PUBLIC",
        isDefaultSeed: true,
      });
      await comm.save();

      for (let i = 0; i < data.rooms.length; i++) {
        const r = data.rooms[i];
        const room = new CommunityRoom({
          communityId: comm._id,
          name: r.name,
          icon: r.icon,
          createdBy: systemUser._id,
          isDefault: i === 0,
          order: i,
        });
        await room.save();
      }
    }
    console.log("Default communities seeded successfully.");
  } catch (error) {
    console.error("Error seeding communities:", error);
  }
};

// 1. GET COMMUNITIES (Public & Joined)
export const getCommunities = async (req, res) => {
  try {
    const userId = req.user._id;
    const { search, category, filter } = req.query;

    let query = {
      $or: [{ privacy: "PUBLIC" }, { "members.user": userId }],
    };

    if (filter === "joined") {
      query = { "members.user": userId };
    }

    if (category && category !== "All") {
      query.category = category;
    }

    if (search) {
      query.name = { $regex: search, $options: "i" };
    }

    const communities = await Community.find(query)
      .populate("owner", "fullName username profilePic")
      .populate("admins", "fullName username profilePic")
      .sort({ createdAt: -1 });

    const result = communities.map((comm) => {
      const userMember = comm.members.find((m) => m.user.toString() === userId.toString());
      return {
        _id: comm._id,
        name: comm.name,
        description: comm.description,
        category: comm.category,
        icon: comm.icon,
        profileImage: comm.profileImage,
        coverImage: comm.coverImage,
        privacy: comm.privacy,
        memberCount: comm.members.length,
        isJoined: !!userMember,
        myRole: userMember ? userMember.role : null,
        owner: comm.owner,
        isDefaultSeed: comm.isDefaultSeed,
      };
    });

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getCommunities:", error);
    res.status(500).json({ message: "Server error fetching communities" });
  }
};

// 2. CREATE COMMUNITY
export const createCommunity = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, description, category, privacy = "PUBLIC", icon = "🏛️", profileImage, defaultRooms } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Community name is required" });
    }

    let imageUrl = profileImage || "";
    if (profileImage && profileImage.startsWith("data:")) {
      try {
        const uploadRes = await cloudinary.uploader.upload(profileImage, { folder: "VibeVerse_communities" });
        imageUrl = uploadRes.secure_url;
      } catch (err) {
        console.error("Cloudinary upload error:", err.message);
      }
    }

    const newCommunity = new Community({
      name: name.trim(),
      description: description ? description.trim() : "",
      category: category || "General",
      privacy,
      icon,
      profileImage: imageUrl,
      owner: userId,
      admins: [userId],
      members: [{ user: userId, role: "OWNER", joinedAt: new Date() }],
    });

    await newCommunity.save();

    // Create default General room
    const roomsToCreate = Array.isArray(defaultRooms) && defaultRooms.length > 0
      ? defaultRooms
      : ["General", "Announcements"];

    for (let i = 0; i < roomsToCreate.length; i++) {
      const rName = roomsToCreate[i];
      const room = new CommunityRoom({
        communityId: newCommunity._id,
        name: typeof rName === "string" ? rName : rName.name,
        icon: typeof rName === "object" ? rName.icon || "💬" : i === 0 ? "💬" : "📢",
        type: i === 1 ? "ANNOUNCEMENT" : "TEXT",
        createdBy: userId,
        isDefault: i === 0,
        order: i,
      });
      await room.save();
    }

    res.status(201).json(newCommunity);
  } catch (error) {
    console.error("Error in createCommunity:", error);
    res.status(500).json({ message: "Server error creating community" });
  }
};

// 3. GET SINGLE COMMUNITY DETAILS WITH ROOMS
export const getCommunityDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const community = await Community.findById(id)
      .populate("owner", "fullName username profilePic")
      .populate("admins", "fullName username profilePic")
      .populate("moderators", "fullName username profilePic")
      .populate("members.user", "fullName username profilePic lastSeen");

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    const userMember = community.members.find((m) => m.user?._id?.toString() === userId.toString());
    if (community.privacy === "PRIVATE" && !userMember) {
      return res.status(403).json({ message: "This is a private community. Request an invite to view." });
    }

    const rooms = await CommunityRoom.find({ communityId: id }).sort({ order: 1, createdAt: 1 });

    res.status(200).json({
      community: {
        _id: community._id,
        name: community.name,
        description: community.description,
        category: community.category,
        icon: community.icon,
        profileImage: community.profileImage,
        coverImage: community.coverImage,
        privacy: community.privacy,
        rules: community.rules,
        owner: community.owner,
        admins: community.admins,
        moderators: community.moderators,
        memberCount: community.members.length,
        isJoined: !!userMember,
        myRole: userMember ? userMember.role : null,
        members: community.members.map((m) => ({
          user: m.user,
          role: m.role,
          joinedAt: m.joinedAt,
        })),
      },
      rooms,
    });
  } catch (error) {
    console.error("Error in getCommunityDetails:", error);
    res.status(500).json({ message: "Server error fetching community" });
  }
};

// 4. JOIN COMMUNITY
export const joinCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const community = await Community.findById(id);
    if (!community) return res.status(404).json({ message: "Community not found" });

    if (community.bannedUsers.some((u) => u.toString() === userId.toString())) {
      return res.status(403).json({ message: "You have been banned from this community." });
    }

    const isAlreadyMember = community.members.some((m) => m.user.toString() === userId.toString());
    if (isAlreadyMember) {
      return res.status(400).json({ message: "You are already a member" });
    }

    community.members.push({ user: userId, role: "MEMBER", joinedAt: new Date() });
    await community.save();

    res.status(200).json({ message: "Joined community successfully", memberCount: community.members.length });
  } catch (error) {
    console.error("Error in joinCommunity:", error);
    res.status(500).json({ message: "Server error joining community" });
  }
};

// 5. LEAVE COMMUNITY
export const leaveCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const community = await Community.findById(id);
    if (!community) return res.status(404).json({ message: "Community not found" });

    if (community.owner.toString() === userId.toString()) {
      return res.status(400).json({ message: "The owner cannot leave the community. Transfer ownership first or delete the community." });
    }

    community.members = community.members.filter((m) => m.user.toString() !== userId.toString());
    community.admins = community.admins.filter((a) => a.toString() !== userId.toString());
    community.moderators = community.moderators.filter((m) => m.toString() !== userId.toString());
    await community.save();

    res.status(200).json({ message: "Left community successfully" });
  } catch (error) {
    console.error("Error in leaveCommunity:", error);
    res.status(500).json({ message: "Server error leaving community" });
  }
};

// 6. UPDATE COMMUNITY
export const updateCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    const { name, description, category, privacy, rules, profileImage, icon } = req.body;

    const community = await Community.findById(id);
    if (!community) return res.status(404).json({ message: "Community not found" });

    const isOwnerOrAdmin =
      community.owner.toString() === userId.toString() ||
      community.admins.some((a) => a.toString() === userId.toString());

    if (!isOwnerOrAdmin) {
      return res.status(403).json({ message: "Only owners and admins can update this community." });
    }

    if (name) community.name = name.trim();
    if (description !== undefined) community.description = description.trim();
    if (category) community.category = category;
    if (privacy) community.privacy = privacy;
    if (rules !== undefined) community.rules = rules;
    if (icon) community.icon = icon;

    if (profileImage && profileImage.startsWith("data:")) {
      try {
        const uploadRes = await cloudinary.uploader.upload(profileImage, { folder: "VibeVerse_communities" });
        community.profileImage = uploadRes.secure_url;
      } catch (err) {
        console.error("Cloudinary upload error:", err.message);
      }
    }

    await community.save();
    res.status(200).json(community);
  } catch (error) {
    console.error("Error in updateCommunity:", error);
    res.status(500).json({ message: "Server error updating community" });
  }
};

// 7. DELETE COMMUNITY (Owner only)
export const deleteCommunity = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const community = await Community.findById(id);
    if (!community) return res.status(404).json({ message: "Community not found" });

    if (community.owner.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Only the owner can delete this community." });
    }

    await Community.findByIdAndDelete(id);
    await CommunityRoom.deleteMany({ communityId: id });
    await CommunityMessage.deleteMany({ communityId: id });

    res.status(200).json({ message: "Community deleted successfully" });
  } catch (error) {
    console.error("Error in deleteCommunity:", error);
    res.status(500).json({ message: "Server error deleting community" });
  }
};

// 8. MEMBER MANAGEMENT (Promote, Demote, Kick, Ban)
export const updateMemberRole = async (req, res) => {
  try {
    const { id, targetUserId } = req.params;
    const { role } = req.body; // 'ADMIN', 'MODERATOR', 'MEMBER'
    const currentUserId = req.user._id;

    const community = await Community.findById(id);
    if (!community) return res.status(404).json({ message: "Community not found" });

    if (community.owner.toString() !== currentUserId.toString()) {
      return res.status(403).json({ message: "Only the owner can change member roles." });
    }

    const member = community.members.find((m) => m.user.toString() === targetUserId);
    if (!member) return res.status(404).json({ message: "Member not found" });

    member.role = role;

    // Update admins/moderators arrays
    community.admins = community.admins.filter((a) => a.toString() !== targetUserId);
    community.moderators = community.moderators.filter((m) => m.toString() !== targetUserId);

    if (role === "ADMIN") community.admins.push(targetUserId);
    if (role === "MODERATOR") community.moderators.push(targetUserId);

    await community.save();
    res.status(200).json({ message: "Role updated successfully", role });
  } catch (error) {
    console.error("Error in updateMemberRole:", error);
    res.status(500).json({ message: "Server error updating role" });
  }
};

export const kickMember = async (req, res) => {
  try {
    const { id, targetUserId } = req.params;
    const currentUserId = req.user._id;

    const community = await Community.findById(id);
    if (!community) return res.status(404).json({ message: "Community not found" });

    const isOwnerOrAdmin =
      community.owner.toString() === currentUserId.toString() ||
      community.admins.some((a) => a.toString() === currentUserId.toString());

    if (!isOwnerOrAdmin) {
      return res.status(403).json({ message: "Only owners and admins can remove members." });
    }

    if (community.owner.toString() === targetUserId) {
      return res.status(400).json({ message: "Cannot remove the community owner." });
    }

    community.members = community.members.filter((m) => m.user.toString() !== targetUserId);
    community.admins = community.admins.filter((a) => a.toString() !== targetUserId);
    community.moderators = community.moderators.filter((m) => m.toString() !== targetUserId);

    await community.save();
    res.status(200).json({ message: "Member removed from community" });
  } catch (error) {
    console.error("Error in kickMember:", error);
    res.status(500).json({ message: "Server error removing member" });
  }
};

// 9. INVITE FRIENDS
export const inviteFriend = async (req, res) => {
  try {
    const { id } = req.params;
    const { friendIds } = req.body;
    const senderId = req.user._id;

    const community = await Community.findById(id);
    if (!community) return res.status(404).json({ message: "Community not found" });

    const ids = Array.isArray(friendIds) ? friendIds : [friendIds];
    const results = [];

    for (const receiverId of ids) {
      const alreadyMember = community.members.some((m) => m.user.toString() === receiverId);
      if (alreadyMember) continue;

      const existingInvite = await CommunityInvitation.findOne({
        communityId: id,
        receiver: receiverId,
        status: "PENDING",
      });

      if (!existingInvite) {
        const invite = new CommunityInvitation({
          communityId: id,
          sender: senderId,
          receiver: receiverId,
        });
        await invite.save();
        results.push(invite);
      }
    }

    res.status(200).json({ message: "Invitations sent", count: results.length });
  } catch (error) {
    console.error("Error in inviteFriend:", error);
    res.status(500).json({ message: "Server error sending invites" });
  }
};

// 10. ROOMS (Create Room, Delete Room)
export const createRoom = async (req, res) => {
  try {
    const { id: communityId } = req.params;
    const { name, description, icon = "#", type = "TEXT", privacy = "PUBLIC" } = req.body;
    const userId = req.user._id;

    const community = await Community.findById(communityId);
    if (!community) return res.status(404).json({ message: "Community not found" });

    const isOwnerOrAdmin =
      community.owner.toString() === userId.toString() ||
      community.admins.some((a) => a.toString() === userId.toString());

    if (!isOwnerOrAdmin) {
      return res.status(403).json({ message: "Only owners and admins can create rooms." });
    }

    const roomCount = await CommunityRoom.countDocuments({ communityId });

    const newRoom = new CommunityRoom({
      communityId,
      name: name.trim(),
      description: description ? description.trim() : "",
      icon,
      type,
      privacy,
      createdBy: userId,
      order: roomCount,
    });

    await newRoom.save();
    res.status(201).json(newRoom);
  } catch (error) {
    console.error("Error in createRoom:", error);
    res.status(500).json({ message: "Server error creating room" });
  }
};

export const deleteRoom = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    const room = await CommunityRoom.findById(roomId);
    if (!room) return res.status(404).json({ message: "Room not found" });

    const community = await Community.findById(room.communityId);
    if (!community) return res.status(404).json({ message: "Community not found" });

    const isOwnerOrAdmin =
      community.owner.toString() === userId.toString() ||
      community.admins.some((a) => a.toString() === userId.toString());

    if (!isOwnerOrAdmin) {
      return res.status(403).json({ message: "Only owners and admins can delete rooms." });
    }

    if (room.isDefault) {
      return res.status(400).json({ message: "Cannot delete the default community room." });
    }

    await CommunityRoom.findByIdAndDelete(roomId);
    await CommunityMessage.deleteMany({ roomId });

    res.status(200).json({ message: "Room deleted successfully" });
  } catch (error) {
    console.error("Error in deleteRoom:", error);
    res.status(500).json({ message: "Server error deleting room" });
  }
};

// 11. ROOM MESSAGES (Get, Send, Polls, Announcements, Game Challenge)
export const getRoomMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { limit = 50, before } = req.query;

    const query = { roomId };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await CommunityMessage.find(query)
      .populate("senderId", "fullName username profilePic")
      .populate("pollData.createdBy", "fullName username profilePic")
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.status(200).json(messages.reverse());
  } catch (error) {
    console.error("Error in getRoomMessages:", error);
    res.status(500).json({ message: "Server error fetching room messages" });
  }
};

export const sendRoomMessage = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;
    const { text, type = "text", image, pollData, announcement, gameData } = req.body;

    const room = await CommunityRoom.findById(roomId);
    if (!room) return res.status(404).json({ message: "Room not found" });

    const community = await Community.findById(room.communityId);
    if (!community) return res.status(404).json({ message: "Community not found" });

    // Check membership
    const isMember = community.members.some((m) => m.user.toString() === userId.toString());
    if (!isMember) {
      return res.status(403).json({ message: "You must join this community to send messages." });
    }

    // Check announcement room permissions
    if (room.type === "ANNOUNCEMENT") {
      const isOwnerOrAdmin =
        community.owner.toString() === userId.toString() ||
        community.admins.some((a) => a.toString() === userId.toString()) ||
        community.moderators.some((m) => m.toString() === userId.toString());

      if (!isOwnerOrAdmin) {
        return res.status(403).json({ message: "Only admins and moderators can post announcements." });
      }
    }

    let mediaUrl = "";
    if (image && image.startsWith("data:")) {
      const uploadRes = await cloudinary.uploader.upload(image, { folder: "VibeVerse_rooms" });
      mediaUrl = uploadRes.secure_url;
    }

    let processedPollData = null;
    if (type === "poll" && pollData && pollData.question && Array.isArray(pollData.options)) {
      processedPollData = {
        question: pollData.question.trim(),
        options: pollData.options.map((opt) => ({
          text: typeof opt === "string" ? opt.trim() : opt.text.trim(),
          votes: [],
        })),
        isClosed: false,
        createdBy: userId,
      };
    }

    const newMessage = new CommunityMessage({
      communityId: room.communityId,
      roomId,
      senderId: userId,
      type,
      text: text ? text.trim() : "",
      mediaUrl,
      pollData: processedPollData,
      announcement: announcement || null,
      gameData: gameData || null,
    });

    await newMessage.save();
    await newMessage.populate("senderId", "fullName username profilePic");

    // Broadcast message to room socket
    io.to(`room:${roomId}`).emit("room:message", newMessage);

    res.status(201).json(newMessage);
  } catch (error) {
    console.error("Error in sendRoomMessage:", error);
    res.status(500).json({ message: "Server error sending room message" });
  }
};

// 12. VOTE IN POLL
export const votePoll = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { optionIndex } = req.body;
    const userId = req.user._id;

    const message = await CommunityMessage.findById(messageId);
    if (!message || message.type !== "poll" || !message.pollData) {
      return res.status(404).json({ message: "Poll not found" });
    }

    if (message.pollData.isClosed) {
      return res.status(400).json({ message: "This poll is closed." });
    }

    // Remove existing vote by user across all options
    message.pollData.options.forEach((opt) => {
      opt.votes = opt.votes.filter((u) => u.toString() !== userId.toString());
    });

    // Add vote to chosen option
    if (message.pollData.options[optionIndex]) {
      message.pollData.options[optionIndex].votes.push(userId);
    }

    await message.save();
    await message.populate("senderId", "fullName username profilePic");

    io.to(`room:${message.roomId}`).emit("room:poll_update", message);

    res.status(200).json(message);
  } catch (error) {
    console.error("Error in votePoll:", error);
    res.status(500).json({ message: "Server error voting in poll" });
  }
};

// 13. CLOSE POLL
export const closePoll = async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await CommunityMessage.findById(messageId);
    if (!message || message.type !== "poll") {
      return res.status(404).json({ message: "Poll not found" });
    }

    const community = await Community.findById(message.communityId);
    const isAuthorized =
      message.senderId.toString() === userId.toString() ||
      community.owner.toString() === userId.toString() ||
      community.admins.some((a) => a.toString() === userId.toString());

    if (!isAuthorized) {
      return res.status(403).json({ message: "Unauthorized to close this poll." });
    }

    message.pollData.isClosed = true;
    await message.save();
    await message.populate("senderId", "fullName username profilePic");

    io.to(`room:${message.roomId}`).emit("room:poll_update", message);

    res.status(200).json(message);
  } catch (error) {
    console.error("Error in closePoll:", error);
    res.status(500).json({ message: "Server error closing poll" });
  }
};
