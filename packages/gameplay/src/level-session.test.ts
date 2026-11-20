import {
  type BaseWorld,
  baseWorldSchema,
  type Level,
  type LevelInput,
  levelSchema,
} from "@penguin-ops/content";
import {
  COMMANDS,
  createGameClock,
  findHost,
  type GameClock,
  lookup,
  TIME_PER_INPUT,
  toGid,
  toUid,
} from "@penguin-ops/engine";
import { describe, expect, test } from "vitest";

import {
  COMMAND_NAMES,
  completeInput,
  type GameEvent,
  type InputResult,
  interruptLevelInput,
  lastCompletedStep,
  levelPrompt,
  type LevelSession,
  runInput,
  startLevel,
  type TerminalEvent,
} from "./level-session";
import { LevelSetupError } from "./level-world";

const START_TIME = 1_750_000_000_000;

const ROOT = { uid: toUid(0), gid: toGid(0), groups: [toGid(0)] };

const WORLD: BaseWorld = baseWorldSchema.parse({
  format: 1,
  id: "office",
  hosts: [
    {
      name: "desk",
      groups: [{ name: "root", gid: 0 }],
      users: [{ name: "root", uid: 0 }],
      files: {
        "/var/log/syslog": "disk full on /dev/sda1\n",
        "~/projects/": {},
        "/etc/motd": "Welcome\n",
      },
    },
    {
      name: "server",
      groups: [{ name: "root", gid: 0 }],
      users: [{ name: "root", uid: 0 }],
    },
  ],
});

function level(fields: Partial<LevelInput>): Level {
  return levelSchema.parse({
    format: 1,
    id: "test-level",
    kind: "main",
    teaches: ["cd"],
    solutions: [["cd /var/log"]],
    ...fields,
  });
}

interface Game {
  readonly clock: GameClock;
  session: LevelSession;
}

function start(fields: Partial<LevelInput>, player = "alice", checkpoint?: string): Game {
  const clock = createGameClock(START_TIME);
  const session = startLevel(
    { level: level(fields), world: WORLD, fileTexts: new Map(), player },
    clock,
    checkpoint,
  );
  return { clock, session };
}

/** Runs a complete input and keeps the new session in `game`. */
function play(
  game: Game,
  input: string,
): { terminal: readonly TerminalEvent[]; game: readonly GameEvent[] } {
  const result: InputResult = runInput(game.session, input, {
    clock: game.clock,
    terminal: { columns: 80 },
  });
  if (result.kind !== "ran") {
    throw new Error(`the input ${JSON.stringify(input)} is incomplete`);
  }
  game.session = result.session;
  return { terminal: result.terminal, game: result.game };
}

/** The output text of terminal events. */
function text(events: readonly TerminalEvent[]): string {
  return events.map((event) => (event.kind === "output" ? event.text : "")).join("");
}

const CD_GOAL: Partial<LevelInput> = { goal: { cwd_is: "/var/log" } };

describe("startLevel", () => {
  test("logs the player in on the start host, in the home, unsolved", () => {
    const { session } = start(CD_GOAL);
    expect(session.shell).toMatchObject({ host: "desk", cwd: "/home/alice", exitStatus: 0 });
    expect(session.shell.variables.get("PWD")).toBe("/home/alice");
    expect(session.shell.variables.get("USER")).toBe("alice");
    expect(session).toMatchObject({
      completedSteps: 0,
      solved: false,
      shownTips: [],
      reachedExtraGoals: [],
    });
  });

  test("starts in start.cwd on start.host", () => {
    expect(start({ ...CD_GOAL, start: { cwd: "~/projects" } }).session.shell).toMatchObject({
      cwd: "/home/alice/projects",
    });
    const onServer = start({ ...CD_GOAL, start: { host: "server", cwd: "/home/./alice/.." } });
    expect(onServer.session.shell).toMatchObject({ host: "server", cwd: "/home" });
    expect(onServer.session.shell.variables.get("PWD")).toBe("/home");
  });

  test("the start directory must be a directory", () => {
    expect(() => start({ ...CD_GOAL, start: { cwd: "/etc/motd" } })).toThrow(
      new LevelSetupError('the start directory "/etc/motd" is not a directory of the world'),
    );
    expect(() => start({ ...CD_GOAL, start: { cwd: "~/missing" } })).toThrow(LevelSetupError);
  });

  test("builds the files with the clock's time", () => {
    const game = start({ ...CD_GOAL, start: { files: { "~/a.txt": "a\n" } } });
    const host = findHost(game.session.world, "desk");
    const file = host && lookup(host.root, ROOT, "/", "/home/alice/a.txt");
    expect(file?.ok && file.node.mtime).toBe(START_TIME);
  });
});

describe("runInput: the shell", () => {
  test("runs the input, records it in the history and moves the clock", () => {
    const game = start(CD_GOAL);
    const { terminal } = play(game, "pwd");
    expect(terminal).toEqual([{ kind: "output", stream: "stdout", text: "/home/alice\n" }]);
    expect(game.session.shell.history.entries.map((entry) => entry.line)).toEqual(["pwd"]);
    expect(game.clock.now()).toBe(START_TIME + TIME_PER_INPUT);
  });

  test.each([
    ["echo 'a", "single-quote"],
    ['echo "a', "double-quote"],
    ["ls |", "command"],
    ["ls &&", "command"],
    ["echo a\\", "next-line"],
  ])("%j is incomplete and changes nothing", (input, missing) => {
    const game = start(CD_GOAL);
    const result = runInput(game.session, input, { clock: game.clock, terminal: { columns: 80 } });
    expect(result).toEqual({ kind: "incomplete", missing });
    expect(game.clock.now()).toBe(START_TIME);
  });

  test("an input of several lines runs as one and is one history entry", () => {
    const game = start(CD_GOAL);
    expect(text(play(game, "echo a |\ncat").terminal)).toBe("a\n");
    expect(game.session.shell.history.entries.map((entry) => entry.line)).toEqual([
      "echo a |\ncat",
    ]);
  });

  test("a syntax error is reported like bash, recorded, with exit status 2", () => {
    const game = start(CD_GOAL);
    expect(play(game, "ls ;;").terminal).toEqual([
      {
        kind: "output",
        stream: "stderr",
        text: "bash: syntax error near unexpected token `;;'\n",
      },
    ]);
    expect(game.session.shell.exitStatus).toBe(2);
    expect(game.session.shell.history.entries.map((entry) => entry.line)).toEqual(["ls ;;"]);
    expect(game.clock.now()).toBe(START_TIME + TIME_PER_INPUT);
    expect(text(play(game, "echo $?").terminal)).toBe("2\n");
  });

  test("unsupported syntax gives a game event, runs nothing and has exit status 1", () => {
    const game = start(CD_GOAL);
    expect(play(game, "cd /var/log &").terminal).toEqual([
      { kind: "syntax-unsupported", feature: "background-job", start: 12 },
    ]);
    expect(game.session.shell.cwd).toBe("/home/alice");
    expect(game.session.solved).toBe(false);
    expect(play(game, "echo $(pwd)").terminal).toEqual([
      { kind: "syntax-unsupported", feature: "command-substitution", start: 5 },
    ]);
    expect(game.session.shell.exitStatus).toBe(1);
  });

  test("the world changes with the commands", () => {
    const game = start({ goal: { dir_exists: "~/reports" } });
    play(game, "mkdir reports");
    expect(game.session.solved).toBe(true);
  });
});

describe("runInput: a single goal", () => {
  test("is solved once the goal holds, with one solved event", () => {
    const game = start(CD_GOAL);
    expect(play(game, "cd /var").game).toEqual([]);
    expect(play(game, "cd log").game).toEqual([{ kind: "solved" }]);
    expect(game.session.solved).toBe(true);
    expect(play(game, "cd /").game).toEqual([]);
    expect(play(game, "cd /var/log").game).toEqual([]);
    expect(game.session.solved).toBe(true);
  });

  test("an output goal sees only the output of the last input", () => {
    const game = start({ goal: { output_contains: "disk full" } });
    expect(play(game, "cat /var/log/syslog > /dev/null").game).toEqual([]);
    expect(play(game, "grep disk /var/log/syslog").game).toEqual([{ kind: "solved" }]);
  });

  test("an output goal sees standard error and a syntax error message", () => {
    const game = start({ goal: { output_contains: "unexpected token" } });
    expect(play(game, "ls ;;").game).toEqual([{ kind: "solved" }]);
  });

  test.each(["alice", "bob-2"])("works the same for the player %j", (player) => {
    const game = start({ goal: { file_exists: "~/projects/plan.txt" } }, player);
    expect(play(game, "touch ~/projects/plan.txt").game).toEqual([{ kind: "solved" }]);
  });
});

const STEPS: Partial<LevelInput> = {
  steps: [
    { id: "find-logs", goal: { cwd_is: "/var/log" }, say: "found-the-logs" },
    { id: "read-log", goal: { output_contains: "disk full" } },
    { id: "note", goal: { file_exists: "~/note.txt" }, say: "noted" },
  ],
  solutions: [["cd /var/log", "cat syslog", "touch ~/note.txt"]],
};

describe("runInput: steps", () => {
  test("completes the steps in order and is solved with the last one", () => {
    const game = start(STEPS);
    expect(lastCompletedStep(game.session)).toBeUndefined();
    expect(play(game, "cat /var/log/syslog").game).toEqual([]);
    expect(play(game, "cd /var/log").game).toEqual([
      { kind: "step-completed", step: "find-logs", say: "found-the-logs" },
    ]);
    expect(lastCompletedStep(game.session)).toBe("find-logs");
    expect(play(game, "cat syslog").game).toEqual([{ kind: "step-completed", step: "read-log" }]);
    expect(game.session).toMatchObject({ completedSteps: 2, solved: false });
    expect(play(game, "touch ~/note.txt").game).toEqual([
      { kind: "step-completed", step: "note", say: "noted" },
      { kind: "solved" },
    ]);
    expect(game.session).toMatchObject({ completedSteps: 3, solved: true });
    expect(lastCompletedStep(game.session)).toBe("note");
  });

  test("one input can complete several steps", () => {
    const game = start(STEPS);
    expect(play(game, "cd /var/log && cat syslog").game).toEqual([
      { kind: "step-completed", step: "find-logs", say: "found-the-logs" },
      { kind: "step-completed", step: "read-log" },
    ]);
  });

  test("a later step that holds early waits for the steps before it", () => {
    const game = start(STEPS);
    expect(play(game, "touch ~/note.txt").game).toEqual([]);
    expect(play(game, "cd /var/log").game).toEqual([
      { kind: "step-completed", step: "find-logs", say: "found-the-logs" },
    ]);
  });

  test("a level with a single goal has no checkpoint", () => {
    const game = start(CD_GOAL);
    play(game, "cd /var/log");
    expect(lastCompletedStep(game.session)).toBeUndefined();
  });
});

describe("startLevel: checkpoints", () => {
  test("resumes after the step with the world of the first reference solution", () => {
    const game = start(STEPS, "alice", "read-log");
    expect(game.session).toMatchObject({ completedSteps: 2, solved: false });
    expect(game.session.shell.cwd).toBe("/var/log");
    expect(game.session.shell.history.entries).toEqual([]);
    expect(game.clock.now()).toBe(START_TIME + 2 * TIME_PER_INPUT);
    expect(play(game, "touch ~/note.txt").game).toEqual([
      { kind: "step-completed", step: "note", say: "noted" },
      { kind: "solved" },
    ]);
  });

  test("tips and extra goals of the replay do not count", () => {
    const game = start(
      {
        ...STEPS,
        tips: [{ when: { cwd_is: "/var/log" }, say: "tip-in-logs" }],
        extra_goals: [{ id: "early", when: { cwd_is: "/var/log" }, xp: 10 }],
      },
      "alice",
      "find-logs",
    );
    expect(game.session).toMatchObject({ shownTips: [], reachedExtraGoals: [] });
  });

  test("throws for an unknown step and a step the reference solution misses", () => {
    expect(() => start(STEPS, "alice", "missing")).toThrow(
      new LevelSetupError('the level "test-level" has no step "missing"'),
    );
    expect(() =>
      start({ ...STEPS, solutions: [["cd /var/log", "pwd"]] }, "alice", "read-log"),
    ).toThrow(
      new LevelSetupError(
        'the first reference solution of the level "test-level" does not complete the step "read-log"',
      ),
    );
    expect(() => start(CD_GOAL, "alice", "find-logs")).toThrow(
      new LevelSetupError('the level "test-level" has no step "find-logs"'),
    );
  });
});

describe("runInput: tips", () => {
  const TIPS: Partial<LevelInput> = {
    ...CD_GOAL,
    tips: [
      { when: { output_contains: "No such file" }, say: "tip-typo" },
      { when: { cwd_is: "/var" }, say: "tip-almost" },
    ],
  };

  test("shows each tip once, in the order of the level", () => {
    const game = start(TIPS);
    expect(play(game, "cd /var; cd /nope").game).toEqual([
      { kind: "tip", say: "tip-typo" },
      { kind: "tip", say: "tip-almost" },
    ]);
    expect(play(game, "cd /nope").game).toEqual([]);
    expect(game.session.shownTips).toEqual([0, 1]);
  });

  test("shows no tips in the input that solves the ticket or after it", () => {
    const game = start({
      ...TIPS,
      tips: [{ when: { cwd_is: "/var/log" }, say: "tip-there" }],
    });
    expect(play(game, "cd /var/log").game).toEqual([{ kind: "solved" }]);
    expect(play(game, "cd /nope").game).toEqual([]);
    expect(game.session.shownTips).toEqual([]);
  });
});

describe("runInput: extra goals", () => {
  test("each extra goal is reached once, also after the ticket is solved", () => {
    const game = start({
      ...CD_GOAL,
      extra_goals: [
        { id: "backup", when: { file_exists: "~/backup.txt" }, xp: 20 },
        { id: "home", when: { cwd_is: "~" }, xp: 5 },
      ],
    });
    expect(play(game, "cd /var/log").game).toEqual([{ kind: "solved" }]);
    expect(play(game, "cd ~ && cp /etc/motd backup.txt").game).toEqual([
      { kind: "extra-goal", id: "backup", xp: 20 },
      { kind: "extra-goal", id: "home", xp: 5 },
    ]);
    expect(play(game, "pwd").game).toEqual([]);
    expect(game.session.reachedExtraGoals).toEqual(["backup", "home"]);
  });

  test("the solved event comes before the extra goals of the same input", () => {
    const game = start({
      ...CD_GOAL,
      extra_goals: [{ id: "logs", when: { cwd_is: "/var/log" }, xp: 5 }],
    });
    expect(play(game, "cd /var/log").game).toEqual([
      { kind: "solved" },
      { kind: "extra-goal", id: "logs", xp: 5 },
    ]);
  });
});

describe("levelPrompt", () => {
  test("is the prompt of the player's shell", () => {
    const game = start({ ...CD_GOAL, start: { cwd: "~/projects" } });
    expect(levelPrompt(game.session)).toEqual({
      userAtHost: "alice@desk",
      directory: "~/projects",
      sign: "$",
    });
    play(game, "cd /var/log");
    expect(levelPrompt(game.session).directory).toBe("/var/log");
  });
});

describe("completeInput", () => {
  test("completes the simulated commands in command position", () => {
    const game = start(CD_GOAL);
    expect(completeInput(game.session, "who", 3)).toMatchObject({
      line: "whoami ",
      cursor: 7,
      bell: false,
    });
    expect(COMMAND_NAMES).toEqual(COMMANDS.map((command) => command.name));
    expect(COMMAND_NAMES).toContain("ls");
  });

  test("completes file names in the player's world and working directory", () => {
    const game = start(CD_GOAL);
    expect(completeInput(game.session, "cd pro", 6)).toMatchObject({
      line: "cd projects/",
      cursor: 12,
    });
    expect(completeInput(game.session, "cat /var/log/sys", 16).line).toBe("cat /var/log/syslog ");
  });

  test("rings the bell and lists the matches when several match", () => {
    const game = start(CD_GOAL);
    const completion = completeInput(game.session, "c", 1);
    expect(completion.bell).toBe(true);
    expect(completion.matches.map((match) => match.name)).toEqual(["cat", "cd", "clear", "cp"]);
  });

  test("throws for a cursor outside the line", () => {
    expect(() => completeInput(start(CD_GOAL).session, "ls", 3)).toThrow(RangeError);
  });
});

describe("interruptLevelInput", () => {
  test("sets the exit status to 130 and changes nothing else", () => {
    const game = start(CD_GOAL);
    play(game, "cd /var/log");
    const interrupted = interruptLevelInput(game.session);
    expect(interrupted.shell).toEqual({ ...game.session.shell, exitStatus: 130 });
    expect(interrupted).toEqual({ ...game.session, shell: interrupted.shell });
    expect(game.clock.now()).toBe(START_TIME + TIME_PER_INPUT);
  });
});

describe("runInput: the game commands", () => {
  test("every hint that ran asks for a hint, before the other game events", () => {
    const game = start(CD_GOAL);
    expect(play(game, "hint; cd /var/log; hint").game).toEqual([
      { kind: "hint-requested" },
      { kind: "hint-requested" },
      { kind: "solved" },
    ]);
  });

  test("a hint that stopped or failed asks for none", () => {
    const game = start(CD_GOAL);
    expect(play(game, "hint | cat").game).toEqual([]);
    expect(play(game, "hint now").game).toEqual([]);
    expect(play(game, "false && hint").game).toEqual([]);
  });

  test("help shows its text without a game event, and its text is no output for the rules", () => {
    const game = start({ goal: { output_contains: "help" } });
    const { terminal, game: events } = play(game, "help");
    expect(terminal).toEqual([{ kind: "game-output", output: { kind: "help" } }]);
    expect(events).toEqual([]);
  });

  test("Tab completes the game commands like the other commands", () => {
    const game = start(CD_GOAL);
    expect(completeInput(game.session, "hi", 2).matches.map((match) => match.name)).toEqual([
      "hint",
      "history",
    ]);
  });
});
