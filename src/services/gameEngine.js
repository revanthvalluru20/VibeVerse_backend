import { Chess } from "chess.js";
import { GAME_TYPES, normalizeGameType } from "../constants/gameConstants.js";

export const gameEngine = {
  /**
   * Initializes initial game state based on gameType
   */
  initGameState: (rawGameType) => {
    const gameType = normalizeGameType(rawGameType);

    switch (gameType) {
      case GAME_TYPES.TIC_TAC_TOE:
        return { grid: Array(9).fill(null) };

      case GAME_TYPES.ROCK_PAPER_SCISSORS:
        return { player1Choice: null, player2Choice: null };

      case GAME_TYPES.CONNECT_FOUR:
        return { grid: Array(6).fill(null).map(() => Array(7).fill(null)) };

      case GAME_TYPES.CHESS: {
        const chess = new Chess();
        return {
          fen: chess.fen(),
          history: [],
          isCheck: false,
          turn: "w",
          captured: { w: [], b: [] },
        };
      }

      case GAME_TYPES.LUDO:
        return {
          p1Tokens: [-1, -1, -1, -1], // 4 tokens (T1-T4) start in the base (-1); a 6 brings one out to 0, target 24
          p2Tokens: [-1, -1, -1, -1],
          diceValue: null,
          canRoll: true,
          canMove: false,
          lastRoll: null,
          targetScore: 24,
          message: "Player 1's turn! Roll a 6 to bring a token out of the base and begin the 24-point race.",
        };

      default:
        return {};
    }
  },

  /**
   * Authoritative Move Processor
   */
  processMove: (game, userId, moveData) => {
    if (game.status !== "ACTIVE") {
      throw new Error("Game is not active");
    }

    const isPlayer1 = game.player1.userId.toString() === userId.toString();
    const isPlayer2 = game.player2.userId.toString() === userId.toString();

    if (!isPlayer1 && !isPlayer2) {
      throw new Error("You are not a player in this game");
    }

    const gameType = normalizeGameType(game.gameType);

    switch (gameType) {
      case GAME_TYPES.TIC_TAC_TOE:
        return processTicTacToeMove(game, userId, isPlayer1, moveData);
      case GAME_TYPES.ROCK_PAPER_SCISSORS:
        return processRockPaperScissorsMove(game, userId, isPlayer1, moveData);
      case GAME_TYPES.CONNECT_FOUR:
        return processConnectFourMove(game, userId, isPlayer1, moveData);
      case GAME_TYPES.CHESS:
        return processChessMove(game, userId, isPlayer1, moveData);
      case GAME_TYPES.LUDO:
        return processLudoMove(game, userId, isPlayer1, moveData);
      default:
        throw new Error(`Unsupported game type: ${game.gameType}`);
    }
  },
};

// ══════════════════════════════════════════════════════════════════════
// 1. TIC-TAC-TOE ENGINE
// ══════════════════════════════════════════════════════════════════════
function processTicTacToeMove(game, userId, isPlayer1, { cellIndex }) {
  if (game.currentTurn.toString() !== userId.toString()) {
    throw new Error("It is not your turn");
  }

  if (cellIndex === undefined || cellIndex < 0 || cellIndex > 8) {
    throw new Error("Invalid cell index");
  }

  const grid = [...game.gameState.grid];
  if (grid[cellIndex] !== null) {
    throw new Error("Cell is already occupied");
  }

  const symbol = isPlayer1 ? "X" : "O";
  grid[cellIndex] = symbol;

  const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];

  let winnerId = null;
  let winnerName = "";
  let isWin = false;

  for (const pattern of winPatterns) {
    const [a, b, c] = pattern;
    if (grid[a] && grid[a] === grid[b] && grid[a] === grid[c]) {
      isWin = true;
      winnerId = userId;
      winnerName = isPlayer1 ? game.player1.fullName : game.player2.fullName;
      break;
    }
  }

  const isDraw = !isWin && grid.every((cell) => cell !== null);

  game.gameState = { grid };
  game.markModified("gameState");

  if (isWin) {
    game.status = "COMPLETED";
    game.winner = winnerId;
    game.winnerName = winnerName;
  } else if (isDraw) {
    game.status = "COMPLETED";
    game.winner = "DRAW";
    game.winnerName = "Draw";
  } else {
    game.currentTurn = isPlayer1 ? game.player2.userId : game.player1.userId;
  }

  return game;
}

// ══════════════════════════════════════════════════════════════════════
// 2. ROCK PAPER SCISSORS ENGINE
// ══════════════════════════════════════════════════════════════════════
function processRockPaperScissorsMove(game, userId, isPlayer1, { choice }) {
  const validChoices = ["rock", "paper", "scissors"];
  if (!choice || !validChoices.includes(choice.toLowerCase())) {
    throw new Error("Invalid choice. Must be rock, paper, or scissors.");
  }

  const cleanChoice = choice.toLowerCase();
  const state = { ...game.gameState };

  if (isPlayer1) {
    if (state.player1Choice) throw new Error("You have already made your choice");
    state.player1Choice = cleanChoice;
    game.player1.choice = cleanChoice;
  } else {
    if (state.player2Choice) throw new Error("You have already made your choice");
    state.player2Choice = cleanChoice;
    game.player2.choice = cleanChoice;
  }

  game.gameState = state;
  game.markModified("gameState");

  if (state.player1Choice && state.player2Choice) {
    const c1 = state.player1Choice;
    const c2 = state.player2Choice;

    game.status = "COMPLETED";

    if (c1 === c2) {
      game.winner = "DRAW";
      game.winnerName = "Draw";
    } else if (
      (c1 === "rock" && c2 === "scissors") ||
      (c1 === "paper" && c2 === "rock") ||
      (c1 === "scissors" && c2 === "paper")
    ) {
      game.winner = game.player1.userId;
      game.winnerName = game.player1.fullName;
    } else {
      game.winner = game.player2.userId;
      game.winnerName = game.player2.fullName;
    }
  }

  return game;
}

// ══════════════════════════════════════════════════════════════════════
// 3. CONNECT FOUR ENGINE
// ══════════════════════════════════════════════════════════════════════
function processConnectFourMove(game, userId, isPlayer1, { colIndex }) {
  if (game.currentTurn.toString() !== userId.toString()) {
    throw new Error("It is not your turn");
  }

  if (colIndex === undefined || colIndex < 0 || colIndex > 6) {
    throw new Error("Invalid column index");
  }

  const grid = game.gameState.grid.map((row) => [...row]);

  let targetRow = -1;
  for (let r = 5; r >= 0; r--) {
    if (grid[r][colIndex] === null) {
      targetRow = r;
      break;
    }
  }

  if (targetRow === -1) {
    throw new Error("Column is full");
  }

  const symbol = isPlayer1 ? "R" : "Y";
  grid[targetRow][colIndex] = symbol;

  const isWin = checkConnectFourWin(grid, targetRow, colIndex, symbol);
  const isDraw = !isWin && grid.every((row) => row.every((cell) => cell !== null));

  game.gameState = { grid };
  game.markModified("gameState");

  if (isWin) {
    game.status = "COMPLETED";
    game.winner = userId;
    game.winnerName = isPlayer1 ? game.player1.fullName : game.player2.fullName;
  } else if (isDraw) {
    game.status = "COMPLETED";
    game.winner = "DRAW";
    game.winnerName = "Draw";
  } else {
    game.currentTurn = isPlayer1 ? game.player2.userId : game.player1.userId;
  }

  return game;
}

function checkConnectFourWin(grid, row, col, symbol) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];

  for (const [dr, dc] of directions) {
    let count = 1;

    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < 6 && c >= 0 && c < 7 && grid[r][c] === symbol) {
      count++;
      r += dr;
      c += dc;
    }

    r = row - dr;
    c = col - dc;
    while (r >= 0 && r < 6 && c >= 0 && c < 7 && grid[r][c] === symbol) {
      count++;
      r -= dr;
      c -= dc;
    }

    if (count >= 4) return true;
  }

  return false;
}

// ══════════════════════════════════════════════════════════════════════
// 4. CHESS ENGINE (Powered by Chess.js)
// ══════════════════════════════════════════════════════════════════════
function processChessMove(game, userId, isPlayer1, moveData) {
  if (moveData.resign) {
    game.status = "COMPLETED";
    game.winner = isPlayer1 ? game.player2.userId : game.player1.userId;
    game.winnerName = isPlayer1 ? game.player2.fullName : game.player1.fullName;
    game.gameState.lastEvent = `${isPlayer1 ? game.player1.fullName : game.player2.fullName} resigned.`;
    game.markModified("gameState");
    return game;
  }

  if (game.currentTurn.toString() !== userId.toString()) {
    throw new Error("It is not your turn");
  }

  const { from, to, promotion = "q" } = moveData;
  if (!from || !to) {
    throw new Error("Move must contain 'from' and 'to' squares (e.g. 'e2', 'e4').");
  }

  const chess = new Chess(game.gameState.fen);

  const expectedColor = isPlayer1 ? "w" : "b";
  if (chess.turn() !== expectedColor) {
    throw new Error("It is not your color's turn.");
  }

  try {
    const move = chess.move({ from, to, promotion });
    if (!move) {
      throw new Error("Illegal move");
    }
  } catch (err) {
    throw new Error(`Illegal chess move from ${from} to ${to}: ${err.message}`);
  }

  const isCheckmate = chess.isCheckmate();
  const isDraw = chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition() || chess.isInsufficientMaterial();

  game.gameState = {
    fen: chess.fen(),
    history: chess.history({ verbose: true }),
    isCheck: chess.inCheck(),
    turn: chess.turn(),
    lastMove: { from, to, san: chess.history().slice(-1)[0] },
  };
  game.markModified("gameState");

  if (isCheckmate) {
    game.status = "COMPLETED";
    game.winner = userId;
    game.winnerName = isPlayer1 ? game.player1.fullName : game.player2.fullName;
  } else if (isDraw) {
    game.status = "COMPLETED";
    game.winner = "DRAW";
    game.winnerName = "Draw (Stalemate / Insufficient Material)";
  } else {
    game.currentTurn = isPlayer1 ? game.player2.userId : game.player1.userId;
  }

  return game;
}

// ══════════════════════════════════════════════════════════════════════
// 5. LUDO 24 RACE ENGINE (4 Tokens Each Racing to 24 Points)
//    Tokens start in the base at -1. A roll of 6 brings one out onto the
//    entry square (0); from there the rolled number is added to its score.
// ══════════════════════════════════════════════════════════════════════
const LUDO_BASE = -1; // token still sitting in the base yard
const LUDO_ENTRY = 0; // first square a token stands on after leaving the base

function processLudoMove(game, userId, isPlayer1, moveData = {}) {
  const state = { ...game.gameState };
  const target = 24;
  const myName = isPlayer1 ? game.player1.fullName : game.player2.fullName;

  // Sanitize tokens: -1 (in base) or a score between 0 and 24
  const sanitize = (tokens) => {
    if (!Array.isArray(tokens) || tokens.length !== 4) return [LUDO_BASE, LUDO_BASE, LUDO_BASE, LUDO_BASE];
    return tokens.map((v) => {
      const n = Number(v);
      if (!Number.isFinite(n)) return LUDO_BASE;
      return Math.min(target, Math.max(LUDO_BASE, Math.trunc(n)));
    });
  };

  // A token in the base needs a 6; a token on the board must not overshoot 24
  const canTokenMove = (score, dice) =>
    score === LUDO_BASE ? dice === 6 : score < target && score + dice <= target;

  state.p1Tokens = sanitize(state.p1Tokens);
  state.p2Tokens = sanitize(state.p2Tokens);

  // Self-heal a stranded turn. A "waiting for a token to be picked" state where no
  // token can legally move would hold the dice forever (games saved by an older
  // version of this engine can be in exactly that shape). Hand the dice straight to
  // the opponent. The outcome is fixed by the rules, so either player may trigger it.
  const turnIsPlayer1 = game.currentTurn.toString() === game.player1.userId.toString();
  const turnName = turnIsPlayer1 ? game.player1.fullName : game.player2.fullName;
  const turnTokens = turnIsPlayer1 ? state.p1Tokens : state.p2Tokens;

  const storedDice = Number(state.diceValue);
  const diceIsValid = Number.isInteger(storedDice) && storedDice >= 1 && storedDice <= 6;
  const turnHasMove = diceIsValid && turnTokens.some((score) => canTokenMove(score, storedDice));

  if (state.canMove && !turnHasMove) {
    state.canRoll = true;
    state.canMove = false;
    state.diceValue = null;
    state.message = diceIsValid
      ? `${turnName} rolled ${storedDice} — no valid moves. Turn passed.`
      : `${turnName} had no valid moves. Turn passed.`;
    game.currentTurn = turnIsPlayer1 ? game.player2.userId : game.player1.userId;
    game.gameState = state;
    game.markModified("gameState");
    return game;
  }

  if (game.currentTurn.toString() !== userId.toString()) {
    throw new Error("It is not your turn");
  }

  const action = String(moveData.action || "").toLowerCase();
  const rawIndex = moveData.tokenIndex;

  const isSkip =
    action === "skip" ||
    action === "pass" ||
    rawIndex === "skip" ||
    rawIndex === "pass" ||
    moveData.skip === true ||
    moveData.pass === true;

  if (isSkip) {
    state.canRoll = true;
    state.canMove = false;
    state.diceValue = null;
    state.message = `${myName} passed their turn.`;
    game.currentTurn = isPlayer1 ? game.player2.userId : game.player1.userId;
    game.gameState = state;
    game.markModified("gameState");
    return game;
  }

  if (action === "roll" || (!action && state.canRoll && rawIndex === undefined)) {
    if (!state.canRoll) {
      throw new Error("You must select which token to advance before rolling again.");
    }

    const diceValue = Math.floor(Math.random() * 6) + 1;
    state.diceValue = diceValue;
    state.lastRoll = diceValue;

    const myTokens = isPlayer1 ? state.p1Tokens : state.p2Tokens;

    const movableTokens = myTokens
      .map((val, idx) => (canTokenMove(val, diceValue) ? idx : -1))
      .filter((idx) => idx !== -1);

    if (movableTokens.length === 0) {
      // No token has a legal move — reset this player's dice state and hand the dice
      // to the opponent. diceValue is cleared so the roll cannot stay actionable for
      // the player who just lost the turn; lastRoll keeps it for display/history.
      const allInBase = myTokens.every((val) => val === LUDO_BASE);
      state.canRoll = true;
      state.canMove = false;
      state.diceValue = null;
      state.message = allInBase
        ? `${myName} rolled ${diceValue} — no valid moves (a 6 is needed to leave the base). Turn passed.`
        : `${myName} rolled ${diceValue} — no valid moves. Turn passed.`;
      game.currentTurn = isPlayer1 ? game.player2.userId : game.player1.userId;
    } else {
      const hasBaseEntry = movableTokens.some((idx) => myTokens[idx] === LUDO_BASE);
      state.canRoll = false;
      state.canMove = true;
      state.message =
        diceValue === 6 && hasBaseEntry
          ? `${myName} rolled a 6! Select a token to bring out of the base (it starts at 0) or advance a token already on the board.`
          : `${myName} rolled ${diceValue}! Select a token (T1 - T4) to add +${diceValue}.`;
    }

    game.gameState = state;
    game.markModified("gameState");
    return game;
  }

  const tokenIndex = Number(rawIndex);
  const isMove = action === "move" || !isNaN(tokenIndex);

  if (isMove) {
    if (!state.canMove) {
      throw new Error("Please roll the dice first.");
    }

    if (isNaN(tokenIndex) || tokenIndex < 0 || tokenIndex > 3) {
      throw new Error("Invalid token index (0 to 3).");
    }

    const dice = state.diceValue || 0;
    const myTokens = isPlayer1 ? [...state.p1Tokens] : [...state.p2Tokens];
    const oppTokens = isPlayer1 ? [...state.p2Tokens] : [...state.p1Tokens];

    const currentScore = myTokens[tokenIndex];
    if (currentScore >= target) {
      throw new Error(`Token ${tokenIndex + 1} has already reached 24 Home! Please pick another token.`);
    }

    const isEntering = currentScore === LUDO_BASE;
    let newScore;

    if (isEntering) {
      if (dice !== 6) {
        throw new Error(`Token ${tokenIndex + 1} is in the base. You need to roll a 6 to bring it out.`);
      }
      newScore = LUDO_ENTRY; // the 6 is spent bringing the token onto the board
    } else {
      newScore = currentScore + dice;
      if (newScore > target) {
        throw new Error(`Cannot overshoot 24! Token ${tokenIndex + 1} is at ${currentScore} and rolled ${dice}.`);
      }
    }

    myTokens[tokenIndex] = newScore;

    // Knock-out/capture check on same step (unless step is target 24 or safe milestones 8, 16).
    // Tokens in the base (-1) and on the entry square (0) are safe.
    let captured = false;
    const safeSteps = [8, 16];
    if (newScore > LUDO_ENTRY && newScore < target && !safeSteps.includes(newScore)) {
      for (let i = 0; i < 4; i++) {
        if (oppTokens[i] === newScore) {
          oppTokens[i] = LUDO_BASE; // send the opponent token back to its base
          captured = true;
          break;
        }
      }
    }

    if (isPlayer1) {
      state.p1Tokens = myTokens;
      state.p2Tokens = oppTokens;
    } else {
      state.p2Tokens = myTokens;
      state.p1Tokens = oppTokens;
    }

    // Check win condition: all 4 tokens have reached 24
    const allTokensHome = myTokens.every((val) => val >= target);

    if (allTokensHome) {
      game.status = "COMPLETED";
      game.winner = userId;
      game.winnerName = myName;
      state.message = `🎉 ${game.winnerName} got all 4 tokens to 24 and won the Ludo Championship!`;
      state.canRoll = false;
      state.canMove = false;
    } else {
      const bonusTurn = dice === 6 || captured;
      state.canRoll = true;
      state.canMove = false;
      state.diceValue = null;

      const moveText = isEntering
        ? `${myName} brought T${tokenIndex + 1} out of the base onto 0/24!`
        : `${myName} advanced T${tokenIndex + 1} to ${newScore}/24!`;

      if (bonusTurn) {
        state.message = `${moveText} ${dice === 6 ? "Rolled a 6" : "Captured opponent token"} — Bonus roll awarded!`;
      } else {
        state.message = `${moveText} Opponent's turn!`;
        game.currentTurn = isPlayer1 ? game.player2.userId : game.player1.userId;
      }
    }

    game.gameState = state;
    game.markModified("gameState");
    return game;
  }

  // Fallback: gracefully pass turn instead of throwing an error
  state.canRoll = true;
  state.canMove = false;
  state.diceValue = null;
  state.message = `${myName} passed their turn.`;
  game.currentTurn = isPlayer1 ? game.player2.userId : game.player1.userId;
  game.gameState = state;
  game.markModified("gameState");
  return game;
}
