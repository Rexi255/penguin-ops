import { type Content, type ContentFile, formatProblem, loadContent } from "@penguin-ops/content";
import { describe, expect, test } from "vitest";

import {
  checkReferenceSolutions,
  formatSolutionProblem,
  REFERENCE_PLAYERS,
  type SolutionProblem,
} from "./reference-solutions";

function yaml(...lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

const WORLD_LINES = [
  "format: 1",
  "id: office",
  "hosts:",
  "  - name: desk",
  "    groups: [{ name: root, gid: 0 }]",
  "    users: [{ name: root, uid: 0 }]",
  "    files:",
  '      /var/log/syslog: "disk full\\n"',
];

/** A catalog with the level's own texts and these extra lines. */
function catalog(...lines: string[]): string {
  return yaml("title: T", "ticket: T", "hints: [a, b, c]", "explanation: { text: E }", ...lines);
}

interface Files {
  /** The lines of level.yaml after `teaches`. */
  readonly level: readonly string[];
  readonly en?: string;
  readonly de?: string;
  readonly extra?: readonly ContentFile[];
  readonly world?: readonly string[];
}

/** Loads content with one level `x` in one chapter. */
function content({ level, en, de, extra = [], world = WORLD_LINES }: Files): Content {
  const ui = yaml("app:", "  name: PenguinOps");
  const result = loadContent({
    chapters: {
      file: "content/chapters.yaml",
      text: yaml("format: 1", "chapters:", "  - id: a", "    levels: [x]"),
    },
    levels: [
      {
        file: "content/levels/x/level.yaml",
        text: yaml("format: 1", "id: x", "kind: main", "teaches: [cd]", ...level),
      },
    ],
    levelCatalogs: [
      { file: "content/levels/x/en.yaml", text: en ?? catalog() },
      { file: "content/levels/x/de.yaml", text: de ?? catalog() },
      ...extra,
    ],
    uiCatalogs: [
      { file: "content/ui/en.yaml", text: ui },
      { file: "content/ui/de.yaml", text: ui },
    ],
    worlds: [{ file: "content/worlds/office.yaml", text: yaml(...world) }],
  });
  if (!result.ok) {
    throw new Error(result.problems.map(formatProblem).join("\n"));
  }
  return result.value;
}

function problems(files: Files): string[] {
  return checkReferenceSolutions(content(files)).map(formatSolutionProblem);
}

/** The problem `message` for every language and player, in the order they are played. */
function everywhere(message: string, languages = ["en", "de"]): string[] {
  return languages.flatMap((language) =>
    REFERENCE_PLAYERS.map((player) => `level "x" (${language}, player "${player}")${message}`),
  );
}

describe("checkReferenceSolutions: valid levels", () => {
  test("a level that its solutions solve has no problems", () => {
    expect(
      problems({
        level: [
          "goal: { cwd_is: /var/log }",
          "tips:",
          "  - { when: { output_contains: No such file }, say: tip-typo }",
          "solutions:",
          "  - [cd /var/log]",
          "  - [cd /var, ls, cd log]",
        ],
        en: catalog("tip-typo: Check the spelling."),
        de: catalog("tip-typo: Prüfe die Schreibweise."),
      }),
    ).toEqual([]);
  });

  test("a multi-step level that resumes at each checkpoint has no problems", () => {
    expect(
      problems({
        level: [
          "steps:",
          "  - { id: logs, goal: { cwd_is: /var/log } }",
          '  - { id: read, goal: { output_contains: "disk full" } }',
          "  - { id: home, goal: { cwd_is: '~' } }",
          "solutions:",
          "  - [cd /var/log, cat syslog, cd]",
        ],
      }),
    ).toEqual([]);
  });

  test("the players are two different valid names", () => {
    expect(REFERENCE_PLAYERS).toEqual(["alice", "max-2"]);
  });
});

describe("checkReferenceSolutions: problems", () => {
  test("a goal, tip or extra goal that holds before the first input", () => {
    expect(
      problems({
        level: [
          "goal: { cwd_is: '~' }",
          "tips: [{ when: { cwd_is: '~' }, say: tip-home }]",
          "extra_goals: [{ id: early, when: { cwd_is: '~' }, xp: 5 }]",
          "solutions: [[cd]]",
        ],
        en: catalog("tip-home: Home.", "extra_goals: { early: Early }"),
        de: catalog("tip-home: Daheim.", "extra_goals: { early: Früh }"),
      }),
    ).toEqual([
      ...everywhere(": the ticket is solved before the first input").flatMap((solved) => [
        solved,
        solved.replace("the ticket is solved", 'the extra goal "early" is reached'),
      ]),
    ]);
  });

  test("a step before the first input", () => {
    expect(
      problems({
        level: [
          "steps:",
          "  - { id: home, goal: { cwd_is: '~' } }",
          "  - { id: logs, goal: { cwd_is: /var/log } }",
          "solutions: [[pwd, cd /var/log]]",
        ],
      }),
    ).toEqual(everywhere(': the step "home" is completed before the first input'));
  });

  test("a tip before the first input", () => {
    expect(
      problems({
        level: [
          "goal: { cwd_is: /var/log }",
          "tips: [{ when: { cwd_is: '~' }, say: tip-home }]",
          "solutions: [[cd /var/log]]",
        ],
        en: catalog("tip-home: Home."),
        de: catalog("tip-home: Daheim."),
      }),
    ).toEqual(everywhere(': the tip "tip-home" is shown before the first input'));
  });

  test("a solution that does not solve the ticket or shows a tip", () => {
    expect(
      problems({
        level: [
          "goal: { cwd_is: /var/log }",
          "tips: [{ when: { cwd_is: /var }, say: tip-almost }]",
          "solutions:",
          "  - [cd /var, cd log]",
          "  - [cd /tmp]",
        ],
        en: catalog("tip-almost: Almost."),
        de: catalog("tip-almost: Fast."),
      }),
    ).toEqual(
      ["en", "de"].flatMap((language) =>
        REFERENCE_PLAYERS.flatMap((player) => [
          `level "x" (${language}, player "${player}"), solution 1: the command line \`cd /var\` shows the tip "tip-almost"`,
          `level "x" (${language}, player "${player}"), solution 2: the ticket is not solved after the solution`,
        ]),
      ),
    );
  });

  test("command lines that are incomplete or use what the game does not simulate", () => {
    const found = problems({
      level: [
        "goal: { cwd_is: /var/log }",
        "solutions:",
        "  - [\"echo 'a\", 'cd /var/log &', echo $$, cat, cd /var/log]",
      ],
    });
    expect(found.slice(0, 4)).toEqual([
      `level "x" (en, player "alice"), solution 1: the command line \`echo 'a\` is incomplete (single-quote missing)`,
      'level "x" (en, player "alice"), solution 1: the command line `cd /var/log &` uses syntax the game does not simulate (background-job)',
      'level "x" (en, player "alice"), solution 1: the command line `echo $$` uses a shell feature the game does not simulate (process-id)',
      'level "x" (en, player "alice"), solution 1: the command line `cat` uses something "cat" does not simulate (terminal-input-not-simulated)',
    ]);
    expect(found).toHaveLength(16);
  });

  test("a level that cannot start, for one player only", () => {
    const world = [
      ...WORLD_LINES.slice(0, 4),
      "    groups: [{ name: root, gid: 0 }, { name: alice, gid: 1001 }]",
      "    users: [{ name: root, uid: 0 }]",
    ];
    expect(problems({ level: ["goal: { cwd_is: / }", "solutions: [[cd /]]"], world })).toEqual([
      'level "x" (en, player "alice"): the level cannot start: the user name "alice" is already taken on the host "desk"',
      'level "x" (de, player "alice"): the level cannot start: the user name "alice" is already taken on the host "desk"',
    ]);
  });

  test("a start directory that does not exist", () => {
    expect(
      problems({
        level: ["start: { cwd: ~/missing }", "goal: { cwd_is: /var }", "solutions: [[cd /var]]"],
      }),
    ).toEqual(
      everywhere(
        ': the level cannot start: the start directory "~/missing" is not a directory of the world',
      ),
    );
  });

  test("a rule on translated text fails in the other languages, also further ones", () => {
    const level = [
      "start:",
      "  files:",
      "    ~/note.txt: { text: note }",
      "goal: { output_contains: Dear }",
      "solutions: [[cat note.txt]]",
    ];
    expect(
      problems({
        level,
        en: catalog("note: Dear successor"),
        de: catalog("note: Liebe Nachfolgerin"),
        extra: [{ file: "content/levels/x/fr.yaml", text: yaml("note: Cher successeur") }],
      }),
    ).toEqual(
      everywhere(", solution 1: the ticket is not solved after the solution", ["de", "fr"]),
    );
  });

  test("a checkpoint at which the level cannot resume", () => {
    const found: SolutionProblem[] = checkReferenceSolutions(
      content({
        level: [
          "steps:",
          "  - { id: logs, goal: { cwd_is: /var/log } }",
          "  - { id: home, goal: { cwd_is: '~' } }",
          "solutions:",
          "  - [cd /var]",
          "  - [cd /var/log, cd]",
        ],
      }),
    );
    expect(found.filter((problem) => problem.solution === undefined)).toEqual(
      ["en", "de"].flatMap((language) =>
        REFERENCE_PLAYERS.map((player) => ({
          level: "x",
          language,
          player,
          message:
            'the checkpoint "logs" cannot start: the first reference solution of the level "x" does not complete the step "logs"',
        })),
      ),
    );
  });
});
