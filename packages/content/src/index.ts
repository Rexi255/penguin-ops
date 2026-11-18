// Public API of the content package.
export {
  DEFAULT_LEVEL_XP,
  type ExtraGoal,
  type FileSource,
  LEVEL_FORMAT_VERSION,
  LEVEL_KINDS,
  type Level,
  type LevelInput,
  type LevelKind,
  type LevelStart,
  type LevelStep,
  type LevelTip,
  levelSchema,
  parseMode,
  RESERVED_TEXT_KEYS,
  type StartAttributes,
  type StartEntry,
} from "./level-schema";
export { levelJsonSchema } from "./level-json-schema";
export { type RuleInput, rulePathSchema, ruleSchema } from "./rule-schema";
