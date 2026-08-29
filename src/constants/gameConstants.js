export const GAME_TYPES = {
  TIC_TAC_TOE: "tic-tac-toe",
  ROCK_PAPER_SCISSORS: "rock-paper-scissors",
  CONNECT_FOUR: "connect-four",
  CHESS: "chess",
  LUDO: "ludo",
};

export const VALID_GAME_TYPES = Object.values(GAME_TYPES);

/**
 * Normalizes any variation of gameType string (camelCase, kebab-case, uppercase, display name)
 * to the canonical GAME_TYPES value.
 */
export function normalizeGameType(type) {
  if (!type) return "";
  const clean = String(type).trim().toLowerCase().replace(/_/g, "-");
  if (clean === "tictactoe" || clean === "tic-tac-toe" || clean === "tic tac toe") return GAME_TYPES.TIC_TAC_TOE;
  if (clean === "rockpaperscissors" || clean === "rock-paper-scissors" || clean === "rock paper scissors" || clean === "rps") return GAME_TYPES.ROCK_PAPER_SCISSORS;
  if (clean === "connectfour" || clean === "connect-four" || clean === "connect four" || clean === "c4") return GAME_TYPES.CONNECT_FOUR;
  if (clean === "chess") return GAME_TYPES.CHESS;
  if (clean === "ludo") return GAME_TYPES.LUDO;
  return clean;
}

export function getGameTitle(type) {
  const normalized = normalizeGameType(type);
  switch (normalized) {
    case GAME_TYPES.TIC_TAC_TOE:
      return "Tic-Tac-Toe";
    case GAME_TYPES.ROCK_PAPER_SCISSORS:
      return "Rock Paper Scissors";
    case GAME_TYPES.CONNECT_FOUR:
      return "Connect Four";
    case GAME_TYPES.CHESS:
      return "Chess";
    case GAME_TYPES.LUDO:
      return "Ludo 24 Race";
    default:
      return "Multiplayer Game";
  }
}
