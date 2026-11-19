import { describe, expect, test } from "vitest";

import { createGameClock } from "./clock";
import { recordHistory } from "./history";
import { toUid } from "./ids";
import {
  CONTINUATION_PROMPT,
  INTERRUPT_EXIT_STATUS,
  interruptInput,
  primaryPrompt,
  promptText,
} from "./prompt";
import { createSession, type Session, setVariable } from "./session";
import { buildWorld } from "./world-builder";

const world = buildWorld(
  {
    hosts: [
      {
        name: "ws01",
        groups: [
          { name: "root", gid: 0 },
          { name: "alice", gid: 1000 },
        ],
        users: [
          { name: "root", uid: 0 },
          { name: "alice", uid: 1000 },
        ],
        files: { "/root/": {}, "/home/alice/docs/": {}, "/home/alicex/": {}, "/srv/": {} },
      },
    ],
  },
  createGameClock(0),
);

const alice = createSession(world, "ws01", "alice");
const root = createSession(world, "ws01", "root");

/** Alice in `directory`, with `PWD` set to it like `cd` does. */
function aliceIn(directory: string): Session {
  return setVariable({ ...alice, cwd: directory }, "PWD", directory);
}

describe("primaryPrompt", () => {
  test("shows user@host, the home as ~ and $ for a user", () => {
    expect(primaryPrompt(world, alice)).toEqual({
      userAtHost: "alice@ws01",
      directory: "~",
      sign: "$",
    });
  });

  test("shows # for root, whose home is /root", () => {
    expect(primaryPrompt(world, root)).toEqual({
      userAtHost: "root@ws01",
      directory: "~",
      sign: "#",
    });
  });

  test("shortens a directory below the home", () => {
    expect(primaryPrompt(world, aliceIn("/home/alice/docs")).directory).toBe("~/docs");
  });

  test("keeps a directory that only starts with the home's name", () => {
    expect(primaryPrompt(world, aliceIn("/home/alicex")).directory).toBe("/home/alicex");
  });

  test("keeps a directory outside the home", () => {
    expect(primaryPrompt(world, aliceIn("/srv")).directory).toBe("/srv");
    expect(primaryPrompt(world, aliceIn("/")).directory).toBe("/");
  });

  test("takes the directory from PWD, not from the working directory", () => {
    const session = setVariable(alice, "PWD", "/srv");
    expect(primaryPrompt(world, session).directory).toBe("/srv");
  });

  test("takes the working directory when PWD is unset", () => {
    const session = setVariable({ ...alice, cwd: "/home/alice/docs" }, "PWD", undefined);
    expect(primaryPrompt(world, session).directory).toBe("~/docs");
  });

  test("follows a changed HOME", () => {
    const session = setVariable(aliceIn("/srv"), "HOME", "/srv");
    expect(primaryPrompt(world, session).directory).toBe("~");
  });

  test("never shortens with HOME unset, empty or /", () => {
    for (const home of [undefined, "", "/"]) {
      const session = setVariable(aliceIn("/srv"), "HOME", home);
      expect(primaryPrompt(world, session).directory).toBe("/srv");
    }
  });

  test("shows bash's text for a user ID without a user", () => {
    const ghost = { ...alice, credentials: { ...alice.credentials, uid: toUid(4242) } };
    expect(primaryPrompt(world, ghost).userAtHost).toBe("I have no name!@ws01");
  });

  test("throws for a host that is not part of the world", () => {
    expect(() => primaryPrompt(world, { ...alice, host: "ws99" })).toThrow(/ws99/u);
  });
});

describe("promptText", () => {
  test("joins the parts like Debian's PS1", () => {
    expect(promptText(primaryPrompt(world, aliceIn("/home/alice/docs")))).toBe(
      "alice@ws01:~/docs$ ",
    );
    expect(promptText(primaryPrompt(world, root))).toBe("root@ws01:~# ");
  });
});

describe("CONTINUATION_PROMPT", () => {
  test("is bash's default PS2", () => {
    expect(CONTINUATION_PROMPT).toBe("> ");
  });
});

describe("interruptInput", () => {
  test("sets the exit status to 130 and keeps everything else", () => {
    const session = recordHistory(aliceIn("/srv"), "ls");
    const interrupted = interruptInput(session);
    expect(INTERRUPT_EXIT_STATUS).toBe(130);
    expect(interrupted).toEqual({ ...session, exitStatus: 130 });
  });
});
