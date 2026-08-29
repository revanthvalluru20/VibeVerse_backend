import GameScore from "../models/GameScore.js";

// Max plausible score thresholds for anti-cheat validation
const SCORE_LIMITS = {
  "target-hitting": 500,
  "simple-cricket": 200,
  "find-number": 100,
  "memory-match": 50,
  "quick-tap": 200,
  "color-reaction": 200,
  "number-sequence": 100,
  "balloon-pop": 500,
  "coin-catch": 500,
  "flappy-arcade": 500,
  snake: 2250,
  2048: 60000,
  "whack-a-mole": 800,
  "brick-breaker": 5000,
  "tic-tac-toe-solo": 300,
};

// 1. GET ALL HIGH SCORES FOR LOGGED-IN USER
export const getMyScores = async (req, res) => {
  try {
    const userId = req.user._id;
    const scores = await GameScore.find({ userId }).sort({ updatedAt: -1 });
    res.status(200).json(scores);
  } catch (error) {
    console.error("Error in getMyScores controller:", error);
    res.status(500).json({ message: "Server error fetching game scores" });
  }
};

// 2. GET SCORE FOR SPECIFIC GAME
export const getScoreByGame = async (req, res) => {
  try {
    const userId = req.user._id;
    const { gameType } = req.params;

    const record = await GameScore.findOne({
      userId,
      gameType: gameType.toLowerCase().trim(),
    });

    if (!record) {
      return res.status(200).json({
        gameType,
        score: 0,
        bestScore: 0,
        gamesPlayed: 0,
      });
    }

    res.status(200).json(record);
  } catch (error) {
    console.error("Error in getScoreByGame controller:", error);
    res.status(500).json({ message: "Server error fetching game score" });
  }
};

// 3. SUBMIT & PERSIST SCORE
export const saveScore = async (req, res) => {
  try {
    const userId = req.user._id;
    const { gameType, score } = req.body;

    if (!gameType || typeof score !== "number") {
      return res.status(400).json({ message: "gameType and a numeric score are required" });
    }

    const cleanGameType = gameType.toLowerCase().trim();

    // Anti-cheat bounds check
    const maxLimit = SCORE_LIMITS[cleanGameType] || 1000;
    if (score < 0 || score > maxLimit) {
      return res.status(400).json({ message: `Score exceeds acceptable range (0 - ${maxLimit})` });
    }

    let record = await GameScore.findOne({ userId, gameType: cleanGameType });

    let isNewHighScore = false;

    if (!record) {
      record = new GameScore({
        userId,
        gameType: cleanGameType,
        score,
        bestScore: score,
        gamesPlayed: 1,
        lastPlayedAt: new Date(),
      });
      isNewHighScore = score > 0;
    } else {
      if (score > record.bestScore) {
        record.bestScore = score;
        isNewHighScore = true;
      }
      record.score = score;
      record.gamesPlayed += 1;
      record.lastPlayedAt = new Date();
    }

    await record.save();

    res.status(200).json({
      ...record.toObject(),
      isNewHighScore,
    });
  } catch (error) {
    console.error("Error in saveScore controller:", error);
    res.status(500).json({ message: "Server error saving score" });
  }
};
