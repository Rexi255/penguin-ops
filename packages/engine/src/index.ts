// Public API of the engine package.
export {
  type DirectoryNode,
  type FileNode,
  type FsNode,
  type NodeAttributes,
  isValidEntryName,
  isValidMode,
  MAX_MODE,
} from "./fs-node";
export {
  BUILTIN_USAGE_STATUS,
  type BuiltinDefinition,
  builtinError,
  type BuiltinInvocation,
  type BuiltinOptionParse,
  defineBuiltin,
  parseBuiltinOptions,
} from "./builtins";
export { legalNumber, toCInt } from "./bash-number";
export { type Clock, createGameClock, type GameClock } from "./clock";
export { cd, clear, COMMANDS, echo, history, ls, pwd, whoami } from "./commands";
export {
  type CommandDefinition,
  type CommandInvocation,
  createCommandLookup,
  defineCommand,
  type RegisteredCommand,
} from "./command-registry";
export { type CalendarTime, utcCalendarTime } from "./calendar";
export { compareNames } from "./collation";
export { displayWidth } from "./display-width";
export {
  FILE_SYSTEM_BLOCK_SIZE,
  type FileStatus,
  fileStatus,
  fileTypeLetter,
  modeString,
  STAT_BLOCK_SIZE,
} from "./file-status";
export { type Credentials } from "./credentials";
export {
  type AssignmentExpansion,
  expandAssignment,
  type ExpansionError,
  expandWords,
  type UnsupportedParameter,
  type WordsExpansion,
} from "./expand";
export {
  type DirectoryEntry,
  type DirectoryOpenResult,
  openDirectory,
  type OpenedForReading,
  openForReading,
  type ReadOpenResult,
} from "./fs-read";
export {
  type FileWrite,
  writeFile,
  type WriteError,
  type WriteMode,
  type WriteResult,
} from "./fs-write";
export {
  addHistoryEntry,
  applyHistorySize,
  clearHistory,
  EMPTY_HISTORY,
  type History,
  type HistoryControl,
  historyControl,
  recordHistory,
  removeHistoryRange,
  stifleHistory,
} from "./history";
export { type Gid, MAX_ID, toGid, toUid, type Uid } from "./ids";
export {
  type CommandContext,
  type CommandDiscard,
  type CommandExit,
  type CommandLookup,
  type CommandNotice,
  type CommandResult,
  type CommandStop,
  type CommandTerminal,
  type InvalidUtf8NotSimulated,
  type OpenFile,
  type OptionNotSimulated,
  type OutputFile,
  type OutputStream,
  runScript,
  type ScriptResult,
  type ScriptRun,
  type ShellCommand,
  type ShellEvent,
  type StandardInput,
  type Terminal,
  type TerminalInputNotSimulated,
  TIME_PER_INPUT,
  type UnsupportedExecution,
  type VariableNotSimulated,
} from "./interpreter";
export {
  type ControlOperator,
  type ControlToken,
  lex,
  type LexError,
  type LexResult,
  type MissingInput,
  type NewlineToken,
  type ParameterPart,
  type RedirectionOperator,
  type RedirectionToken,
  type TextPart,
  type TildePart,
  type Token,
  type UnsupportedFeature,
  type WordPart,
  type WordToken,
} from "./lexer";
export { lookup, type LookupError, type LookupResult } from "./lookup";
export {
  type OptionArgument,
  type OptionError,
  optionErrorMessage,
  type OptionOrder,
  type OptionParseResult,
  type OptionSpec,
  type OptionSyntax,
  type ParsedOption,
  parseOptions,
  tryHelpMessage,
  validateOptionSpecs,
} from "./options";
export {
  type AndOrList,
  type AndOrOperator,
  type AndOrPart,
  type Assignment,
  type Command,
  parse,
  type ParseError,
  type ParseMissingInput,
  type ParseResult,
  type Pipeline,
  type Redirection,
  type Script,
  type SimpleCommand,
  type SupportedRedirectionOperator,
  type UnsupportedSyntax,
  type Word,
} from "./parser";
export { joinAbsolute, type PathParts, splitPath } from "./path";
export { type Access, hasPermission } from "./permissions";
export { localeQuote, shellQuote, shellQuoteAlways } from "./quote";
export { createRandom, type RandomGenerator } from "./random";
export {
  createSession,
  DEFAULT_IFS,
  type Session,
  setVariable,
  TERMINAL_TYPE,
  userAtHost,
} from "./session";
export { decodeUtf8, encodeCodePoint, encodeUtf8, isScalarValue } from "./utf8";
export {
  createWorld,
  findGroup,
  findGroupByGid,
  findHost,
  findUser,
  findUserByUid,
  type Group,
  groupIdsOf,
  type Host,
  InvalidWorldError,
  replaceHostRoot,
  type User,
  type World,
} from "./world";
export {
  buildWorld,
  type GroupSpec,
  type HostSpec,
  type NodeSpec,
  type UserSpec,
  type WorldSpec,
} from "./world-builder";
