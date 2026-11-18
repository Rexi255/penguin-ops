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
  TEXT_KEY_PATTERN,
  type StartAttributes,
  type StartEntry,
} from "./level-schema";
export { levelJsonSchema } from "./level-json-schema";
export { type RuleInput, rulePathSchema, ruleSchema } from "./rule-schema";
export {
  type ContentProblem,
  formatDataPath,
  formatProblem,
  type LoadResult,
  sortProblems,
} from "./content-problem";
export { loadLevel, loadYaml } from "./level-loader";
export {
  type Chapter,
  type Chapters,
  type ChaptersInput,
  CHAPTERS_FORMAT_VERSION,
  chaptersSchema,
} from "./chapters-schema";
export {
  type Content,
  type ContentFile,
  type ContentFiles,
  type LevelCatalogs,
  loadContent,
  type UiCatalogs,
} from "./content-loader";
export {
  type Catalogs,
  isMandatoryLanguage,
  LANGUAGE_NAMES,
  LANGUAGE_PATTERN,
  type LevelCatalog,
  levelCatalogSchema,
  type LevelExplanation,
  type LevelHints,
  type LevelOption,
  MANDATORY_LANGUAGES,
  type MandatoryLanguage,
  type PartialLevelCatalog,
  partialLevelCatalogSchema,
  type UiCatalog,
  uiCatalogSchema,
} from "./catalog-schema";
export {
  parseYaml,
  type SourcePosition,
  type YamlParseResult,
  type YamlSource,
} from "./yaml-source";
