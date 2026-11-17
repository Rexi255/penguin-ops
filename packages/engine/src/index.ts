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
export { type Clock, createGameClock, type GameClock } from "./clock";
export { compareNames } from "./collation";
export { type Credentials } from "./credentials";
export {
  type AssignmentExpansion,
  expandAssignment,
  type ExpansionError,
  expandWords,
  type UnsupportedParameter,
  type WordsExpansion,
} from "./expand";
export { type Gid, MAX_ID, toGid, toUid, type Uid } from "./ids";
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
export { createRandom, type RandomGenerator } from "./random";
export { createSession, DEFAULT_IFS, type Session, userAtHost } from "./session";
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
