import { describe, expect, test } from "vitest";

import { formatProblem } from "./content-problem";
import { loadYaml } from "./level-loader";
import { type BaseWorld, baseWorldSchema, DEFAULT_WORLD_ID, PLAYER_ID } from "./world-schema";

const FILE = "content/worlds/office.yaml";

function yaml(...lines: string[]): string {
  return `${lines.join("\n")}\n`;
}

/** A world file with one host `desk` and these extra lines inside the host. */
function hostWorld(...hostLines: string[]): string {
  return yaml("format: 1", "id: office", "hosts:", "  - name: desk", ...hostLines);
}

const ROOT_ACCOUNTS = ["    groups:", "      - { name: root, gid: 0 }", "    users:"];

function load(text: string): BaseWorld {
  const result = loadYaml(baseWorldSchema, FILE, text);
  if (!result.ok) {
    throw new Error(result.problems.map(formatProblem).join("\n"));
  }
  return result.value;
}

function problems(text: string): string[] {
  const result = loadYaml(baseWorldSchema, FILE, text);
  return result.ok ? [] : result.problems.map(formatProblem);
}

describe("baseWorldSchema: valid worlds", () => {
  test("parses hosts with groups, users and files; defaults stay unset", () => {
    const world = load(
      yaml(
        "format: 1",
        "id: office",
        "hosts:",
        "  - name: desk",
        "    groups:",
        "      - { name: root, gid: 0 }",
        "      - { name: staff, gid: 50, members: [anna] }",
        "      - { name: anna, gid: 1001 }",
        "    users:",
        "      - { name: root, uid: 0 }",
        "      - { name: anna, uid: 1001, home: /srv/anna, shell: /bin/sh }",
        "      - { name: backup, uid: 34, group: staff }",
        "    files:",
        '      /etc/motd: "Welcome\\n"',
        "      /srv/share/: { owner: anna, group: staff, mode: rwxrwsr-x }",
        '      ~/notes.txt: { content: "x\\n", mode: rw------- }',
        "  - name: server",
        "    groups: [{ name: root, gid: 0 }]",
        "    users: [{ name: root, uid: 0 }]",
      ),
    );
    expect(world).toEqual({
      format: 1,
      id: "office",
      hosts: [
        {
          name: "desk",
          groups: [
            { name: "root", gid: 0, members: [] },
            { name: "staff", gid: 50, members: ["anna"] },
            { name: "anna", gid: 1001, members: [] },
          ],
          users: [
            { name: "root", uid: 0 },
            { name: "anna", uid: 1001, home: "/srv/anna", shell: "/bin/sh" },
            { name: "backup", uid: 34, group: "staff" },
          ],
          files: [
            { kind: "file", path: "/etc/motd", source: { kind: "content", content: "Welcome\n" } },
            {
              kind: "directory",
              path: "/srv/share",
              owner: "anna",
              group: "staff",
              mode: 0o2775,
            },
            {
              kind: "file",
              path: "~/notes.txt",
              source: { kind: "content", content: "x\n" },
              mode: 0o600,
            },
          ],
        },
        {
          name: "server",
          groups: [{ name: "root", gid: 0, members: [] }],
          users: [{ name: "root", uid: 0 }],
          files: [],
        },
      ],
    });
  });

  test("the standard world is office, and the player's IDs are 1000", () => {
    expect(DEFAULT_WORLD_ID).toBe("office");
    expect(PLAYER_ID).toBe(1000);
  });
});

describe("baseWorldSchema: problems", () => {
  test("a world needs a format, an ID and at least one host", () => {
    expect(problems(yaml("format: 2", "id: Office", "hosts: []"))).toEqual([
      `${FILE}:1:1: format: the world format version must be 1`,
      `${FILE}:2:1: id: a world ID must be kebab-case: lowercase letters and digits, separated by single hyphens`,
      `${FILE}:3:1: hosts: a world needs at least one host`,
    ]);
  });

  test("host names are valid and unique", () => {
    const host = (name: string) => [
      `  - name: ${name}`,
      "    groups: [{ name: root, gid: 0 }]",
      "    users: [{ name: root, uid: 0 }]",
    ];
    expect(
      problems(
        yaml("format: 1", "id: office", "hosts:", ...host("desk"), ...host("desk"), ...host("A_b")),
      ),
    ).toEqual([
      `${FILE}:7:5: hosts[1].name: the host name "desk" is repeated`,
      `${FILE}:10:5: hosts[2].name: not a valid host name`,
    ]);
  });

  test("every host has root with uid 0 and the group root with gid 0", () => {
    expect(
      problems(
        hostWorld("    groups: [{ name: wheel, gid: 0 }]", "    users: [{ name: admin, uid: 0 }]"),
      ),
    ).toEqual([
      `${FILE}:5:5: hosts[0].groups: a host needs the group "root" with gid 0`,
      `${FILE}:6:5: hosts[0].users: a host needs the user "root" with uid 0`,
      `${FILE}:6:15: hosts[0].users[0].name: the primary group "admin" of the user "admin" does not exist on the host`,
    ]);
  });

  test("names and IDs of users and groups are unique", () => {
    expect(
      problems(
        hostWorld(
          "    groups:",
          "      - { name: root, gid: 0 }",
          "      - { name: root, gid: 5 }",
          "      - { name: staff, gid: 0 }",
          "    users:",
          "      - { name: root, uid: 0 }",
          "      - { name: root, uid: 7, group: staff }",
          "      - { name: other, uid: 0, group: staff }",
        ),
      ),
    ).toEqual([
      `${FILE}:7:11: hosts[0].groups[1].name: the group name "root" is repeated`,
      `${FILE}:8:24: hosts[0].groups[2].gid: the gid 0 is repeated`,
      `${FILE}:11:11: hosts[0].users[1].name: the user name "root" is repeated`,
      `${FILE}:12:24: hosts[0].users[2].uid: the uid 0 is repeated`,
    ]);
  });

  test("the player's uid and gid 1000 stay free, and IDs are whole numbers in range", () => {
    expect(
      problems(
        hostWorld(
          "    groups:",
          "      - { name: root, gid: 0 }",
          "      - { name: staff, gid: 1000 }",
          "      - { name: big, gid: 4294967295 }",
          "    users:",
          "      - { name: root, uid: 0 }",
          "      - { name: anna, uid: 1000, group: staff }",
          "      - { name: bob, uid: -1, group: staff }",
          "      - { name: carl, uid: 1.5, group: staff }",
        ),
      ),
    ).toEqual([
      `${FILE}:7:24: hosts[0].groups[1].gid: the gid 1000 belongs to the player's account`,
      `${FILE}:8:22: hosts[0].groups[2].gid: a gid is at most 4294967294`,
      `${FILE}:11:23: hosts[0].users[1].uid: the uid 1000 belongs to the player's account`,
      `${FILE}:12:22: hosts[0].users[2].uid: a uid is not negative`,
      `${FILE}:13:23: hosts[0].users[3].uid: a uid is a whole number`,
    ]);
  });

  test("members are not repeated", () => {
    expect(
      problems(
        hostWorld(
          "    groups:",
          "      - { name: root, gid: 0, members: [root, root] }",
          "    users:",
          "      - { name: root, uid: 0 }",
        ),
      ),
    ).toEqual([`${FILE}:6:47: hosts[0].groups[0].members[1]: the member "root" is repeated`]);
  });

  test("primary groups and members exist", () => {
    expect(
      problems(
        hostWorld(
          "    groups:",
          "      - { name: root, gid: 0, members: [ghost] }",
          "    users:",
          "      - { name: root, uid: 0 }",
          "      - { name: anna, uid: 1001, group: staff }",
        ),
      ),
    ).toEqual([
      `${FILE}:6:41: hosts[0].groups[0].members[0]: the member "ghost" is no user of the host`,
      `${FILE}:9:34: hosts[0].users[1].group: the primary group "staff" of the user "anna" does not exist on the host`,
    ]);
  });

  test("homes and shells are absolute paths", () => {
    expect(
      problems(
        hostWorld(...ROOT_ACCOUNTS, "      - { name: root, uid: 0, home: root, shell: bash }"),
      ),
    ).toEqual([
      `${FILE}:8:31: hosts[0].users[0].home: a home directory must be an absolute path`,
      `${FILE}:8:43: hosts[0].users[0].shell: a login shell must be an absolute path`,
    ]);
  });

  test("owners and groups of files exist on the host", () => {
    expect(
      problems(
        hostWorld(
          ...ROOT_ACCOUNTS,
          "      - { name: root, uid: 0 }",
          "    files:",
          '      /etc/a: { content: "", owner: ghost }',
          "      /srv/: { group: nobody }",
        ),
      ),
    ).toEqual([
      `${FILE}:10:7: hosts[0].files["/etc/a"]: the owner "ghost" is no user of the host`,
      `${FILE}:11:7: hosts[0].files["/srv/"]: the group "nobody" is no group of the host`,
    ]);
  });

  /** A world whose host has root and these lines under `files:`. */
  const withFiles = (...lines: string[]) =>
    hostWorld(...ROOT_ACCOUNTS, "      - { name: root, uid: 0 }", "    files:", ...lines);

  test("world files are literal: a text key is an unknown field", () => {
    expect(problems(withFiles("      /etc/a: { text: handover }"))).toEqual([
      `${FILE}:10:7: hosts[0].files["/etc/a"]: a file needs content; end the path with "/" for a directory`,
      `${FILE}:10:17: hosts[0].files["/etc/a"].text: unknown field "text"`,
    ]);
    expect(problems(withFiles("      /etc/d: 5"))).toEqual([
      `${FILE}:10:7: hosts[0].files["/etc/d"]: a file is its content (a string) or an object with content; a directory is {} or an object with owner, group and mode`,
    ]);
  });

  test("file paths and entries are checked like start files", () => {
    expect(
      problems(
        withFiles(
          "      /etc/b: { mode: rw------- }",
          '      /srv/: { content: "x" }',
          "      etc/c: x",
        ),
      ),
    ).toEqual([
      `${FILE}:10:7: hosts[0].files["/etc/b"]: a file needs content; end the path with "/" for a directory`,
      `${FILE}:11:7: hosts[0].files["/srv/"]: a directory (path ending with "/") has no content`,
      `${FILE}:12:7: hosts[0].files["etc/c"]: a file path must be absolute or start with "~/" (the player's home)`,
    ]);
  });

  test("unknown fields are errors", () => {
    expect(
      problems(
        hostWorld(
          ...ROOT_ACCOUNTS,
          "      - { name: root, uid: 0, password: x }",
          "    ip: 10.0.0.1",
        ),
      ),
    ).toEqual([
      `${FILE}:8:31: hosts[0].users[0].password: unknown field "password"`,
      `${FILE}:9:5: hosts[0].ip: unknown field "ip"`,
    ]);
  });
});
