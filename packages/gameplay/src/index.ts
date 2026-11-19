// Public API of the gameplay package.
export {
  type AutoPlay,
  autoPlay,
  DeveloperModeError,
  inspectRules,
  type LevelRuleStates,
  levelSetup,
  type PlayedLine,
  type RuleState,
  startAtStep,
  type StepStatus,
} from "./developer-mode";
export {
  evaluate,
  type GameEvent,
  type InputOptions,
  type InputResult,
  lastCompletedStep,
  type LevelSession,
  type LevelSetup,
  runInput,
  startLevel,
  type TerminalEvent,
} from "./level-session";
export {
  isValidPlayerName,
  LevelSetupError,
  levelWorldSpec,
  PLAYER_HOME_MODE,
  playerHome,
  startHost,
} from "./level-world";
export {
  checkPlayerName,
  GAME_MODES,
  type GameMode,
  type NewGame,
  normalizePlayerName,
  PLAYER_NAME_MAX_LENGTH,
  type PlayerNameProblem,
} from "./new-game";
export {
  checkReferenceSolutions,
  formatSolutionProblem,
  REFERENCE_PLAYERS,
  REFERENCE_START_TIME,
  type SolutionProblem,
} from "./reference-solutions";
export {
  checkUserName,
  deriveUserName,
  reservedUserNames,
  USER_NAME_MAX_LENGTH,
  type UserNameProblem,
} from "./user-name";
