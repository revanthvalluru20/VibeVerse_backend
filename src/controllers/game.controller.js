import Game from "../models/Game.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { gameEngine } from "../services/gameEngine.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import { GAME_TYPES, VALID_GAME_TYPES, normalizeGameType, getGameTitle } from "../constants/gameConstants.js";

export const createGameInvite = async (req, res) => {
  try {
    const receiverId = req.body.receiverId || req.body.opponentId || req.body.targetUserId;
    const rawGameType = req.body.gameType;
    const senderId = req.user._id;

    if (!receiverId || !rawGameType) {
      return res.status(400).json({ message: "Receiver ID and Game Type are required" });
    }

    const gameType = normalizeGameType(rawGameType);

    if (!VALID_GAME_TYPES.includes(gameType)) {
      return res.status(400).json({
        success: false,
        code: "UNSUPPORTED_GAME_TYPE",
        message: `Unsupported game type: ${rawGameType}`,
      });
    }

    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: "Receiver not found" });
    }

    // Check friendship: allow if sender or receiver are connected friends
    const sender = await User.findById(senderId);
    const isFriend =
      (sender.friends && sender.friends.some((f) => f.toString() === receiverId.toString())) ||
      (receiver.friends && receiver.friends.some((f) => f.toString() === senderId.toString()));

    if (!isFriend) {
      return res.status(403).json({ message: "You must be friends before sending game invitations" });
    }

    // Set symbols / colors based on game type
    let p1Symbol = "";
    let p2Symbol = "";
    if (gameType === GAME_TYPES.TIC_TAC_TOE) {
      p1Symbol = "X";
      p2Symbol = "O";
    } else if (gameType === GAME_TYPES.ROCK_PAPER_SCISSORS) {
      p1Symbol = "P1";
      p2Symbol = "P2";
    } else if (gameType === GAME_TYPES.CONNECT_FOUR) {
      p1Symbol = "R";
      p2Symbol = "Y";
    } else if (gameType === GAME_TYPES.CHESS) {
      p1Symbol = "White";
      p2Symbol = "Black";
    } else if (gameType === GAME_TYPES.LUDO) {
      p1Symbol = "Red";
      p2Symbol = "Green";
    }

    const game = new Game({
      gameType,
      player1: {
        userId: senderId,
        fullName: req.user.fullName,
        profilePic: req.user.profilePic,
        symbol: p1Symbol,
      },
      player2: {
        userId: receiver._id,
        fullName: receiver.fullName,
        profilePic: receiver.profilePic,
        symbol: p2Symbol,
      },
      currentTurn: senderId,
      gameState: gameEngine.initGameState(gameType),
      status: "WAITING",
    });

    await game.save();

    // Create a special message card inside the chat conversation
    const message = new Message({
      senderId,
      receiverId: receiver._id,
      type: "game_invite",
      text: `🎮 Sent a game invitation for ${getGameTitle(gameType)}`,
      gameData: {
        gameId: game._id,
        gameType,
        status: "WAITING",
        winner: null,
        winnerName: "",
      },
    });

    await message.save();

    // Notify receiver over Socket.IO if online
    const receiverSocketId = getReceiverSocketId(receiver._id.toString());
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("newMessage", message);
      io.to(receiverSocketId).emit("game:invite", { game, message });
    }

    res.status(201).json({ game, message });
  } catch (error) {
    console.error("Error in createGameInvite:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const acceptGameInvite = async (req, res) => {
  try {
    const gameId = req.params.gameId || req.params.id;
    const userId = req.user._id;

    const game = await Game.findById(gameId);
    if (!game) return res.status(404).json({ message: "Game not found" });

    if (
      game.player2.userId.toString() !== userId.toString() &&
      game.player1.userId.toString() !== userId.toString()
    ) {
      return res.status(403).json({ message: "You are not a participant in this game" });
    }

    if (game.status === "WAITING") {
      game.status = "ACTIVE";
      game.gameState = gameEngine.initGameState(game.gameType);
      game.currentTurn = game.player1.userId;
      await game.save();

      // Update message status
      await Message.updateMany(
        { "gameData.gameId": game._id },
        { $set: { "gameData.status": "ACTIVE" } }
      );

      // Notify both players via Socket
      const p1Socket = getReceiverSocketId(game.player1.userId.toString());
      const p2Socket = getReceiverSocketId(game.player2.userId.toString());

      if (p1Socket) io.to(p1Socket).emit("game:update", game);
      if (p2Socket) io.to(p2Socket).emit("game:update", game);
    }

    res.status(200).json(game);
  } catch (error) {
    console.error("Error in acceptGameInvite:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const declineGameInvite = async (req, res) => {
  try {
    const gameId = req.params.gameId || req.params.id;
    const userId = req.user._id;

    const game = await Game.findById(gameId);
    if (!game) return res.status(404).json({ message: "Game not found" });

    if (
      game.player2.userId.toString() !== userId.toString() &&
      game.player1.userId.toString() !== userId.toString()
    ) {
      return res.status(403).json({ message: "Only participants can cancel this invitation" });
    }

    game.status = "CANCELLED";
    await game.save();

    await Message.updateMany(
      { "gameData.gameId": game._id },
      { $set: { "gameData.status": "CANCELLED" } }
    );

    const p1Socket = getReceiverSocketId(game.player1.userId.toString());
    const p2Socket = getReceiverSocketId(game.player2.userId.toString());

    if (p1Socket) io.to(p1Socket).emit("game:update", game);
    if (p2Socket) io.to(p2Socket).emit("game:update", game);

    res.status(200).json({ message: "Game invitation declined", game });
  } catch (error) {
    console.error("Error in declineGameInvite:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const respondGameInvite = async (req, res) => {
  const { action } = req.body;
  if (action === "ACCEPT") {
    return acceptGameInvite(req, res);
  } else {
    return declineGameInvite(req, res);
  }
};

export const getGame = async (req, res) => {
  try {
    const gameId = req.params.gameId || req.params.id;
    const game = await Game.findById(gameId);
    if (!game) return res.status(404).json({ message: "Game not found" });
    res.status(200).json(game);
  } catch (error) {
    console.error("Error in getGame:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const makeMove = async (req, res) => {
  try {
    const gameId = req.params.gameId || req.params.id;
    const userId = req.user._id;
    const moveData = req.body;

    let game = await Game.findById(gameId);
    if (!game) return res.status(404).json({ message: "Game not found" });

    game = gameEngine.processMove(game, userId, moveData);
    await game.save();

    if (game.status === "COMPLETED") {
      await Message.updateMany(
        { "gameData.gameId": game._id },
        {
          $set: {
            "gameData.status": "COMPLETED",
            "gameData.winner": game.winner,
            "gameData.winnerName": game.winnerName,
          },
        }
      );
    }

    const p1Socket = getReceiverSocketId(game.player1.userId.toString());
    const p2Socket = getReceiverSocketId(game.player2.userId.toString());

    if (p1Socket) io.to(p1Socket).emit("game:update", game);
    if (p2Socket) io.to(p2Socket).emit("game:update", game);

    res.status(200).json(game);
  } catch (error) {
    console.error("Error in makeMove:", error.message);
    res.status(400).json({ message: error.message });
  }
};
