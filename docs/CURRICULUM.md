# Curriculum

What the game teaches, in which order. Reasons: [ADR 0024](decisions/0024-curriculum-and-editor.md).

## Principles

1. **Read before change:** players look around and read files before they create, move or
   delete anything.
2. **One host before many:** everything up to chapter 8 happens on one computer; chapters 9 and
   10 introduce the network and other servers.
3. **Every chapter builds on the previous one** and reuses earlier commands in review tickets.
4. The simulated system is **Debian 13**; output and errors follow it (ADR 0004).
5. `man` pages are English like in real Linux; German explanations go into the in-game
   handbook.

Each chapter has about 5–8 main tickets, an incident at the end, review tickets and a few
optional side tickets (ADR 0017). Chapters 6–13 are the core of system integration work.

## Chapters

| # | Chapter (story hook) | Commands and concepts | Example incident |
|---|---|---|---|
| 0 | First day (onboarding) | `pwd`, `ls`, `cd`; absolute and relative paths, `~ . ..`; tab completion, history, `help`, `hint` | Find the trainer's checklist |
| 1 | What others left behind | `cat`, `less`, `head`, `tail`, `wc`; `ls -a`, `ls -l`, hidden files | Reconstruct the predecessor's handover |
| 2 | Tidying up | `mkdir`, `touch`, `cp`, `mv`, `rm`, `rmdir`; globs `*`, `?`, `[ ]` | "Disk full!" |
| 3 | Search and find | `grep` (`-i -r -n -v -c`), `find`, `sort`, `uniq`, `cut` | Who "accidentally" moved the company presentation? |
| 4 | Pipes and redirection | `\|`, `>`, `>>`, `2>`, `/dev/null`, `tee` | Log analysis after an outage: which IP hammers the server? |
| 5 | Editing files | `nano`, `echo`; editing config files | A typo in a config takes down the intranet |
| 6 | Users, groups, permissions | `id`, `groups`, `chmod` (rwx and octal), `chown`, `sudo`, `useradd`, `usermod`, `passwd`, `/etc/passwd` | The new colleague can suddenly read the salary list |
| 7 | Processes and resources | `ps`, `top`, `kill`, `df`, `du`, `free`, `uptime`, `uname` | Something eats the CPU (the coffee machine?) |
| 8 | Services and logs | `systemctl`, `journalctl`, `/var/log`, `cron`, `crontab` | The web server is dead after an update |
| 9 | Network basics | `ip`, `ping`, `ss`, `/etc/hosts`, `dig`, `host`, `curl` | "The internet is broken" (it's DNS) |
| 10 | Remote access (more servers join) | `ssh`, `scp`, `ssh-keygen`, `authorized_keys`, `~/.ssh/config`, `rsync` | A server nobody can log in to anymore |
| 11 | Software and updates | `apt` (`update`, `upgrade`, `install`, `remove`, `search`), `dpkg -l` | An update that brings half the company to a halt |
| 12 | Archives and backup | `tar`, `gzip`, `zip`, backups with `rsync`, restore | Data recovery after an `rm -rf` |
| 13 | Bash scripts | shebang, variables, `$1`, `if` and `test`, `for` and `while`, exit codes, functions, automation with `cron` | The predecessor hid his work in scripts |
| 14 | Finale | everything combined across several servers | The mystery about the predecessor is solved |

## MVP (version 0.1): chapters 0–2

About 25–30 tickets. Commands needed by the engine: everything from the prototype (`pwd`, `ls`,
`cd`, `cat`, `mkdir`, `touch`, `cp`, `mv`, `rm`, `echo`, `head`, `tail`, `grep`, `history`,
`whoami`, `clear`, plus the game commands `help` and `hint`), and new for chapters 1–2: `less`
(full-screen program), `wc`, `rmdir`, `ls -l` details and glob brackets `[ ]`.

The prototype's five levels map to the MVP as follows (they are ported in M2.6 as test
content and rewritten as real tickets in M4):

| Prototype level | Level ID | Chapter |
|---|---|---|
| 1 First working day (`pwd`, `ls`, `cd`) | `first-steps` | 0 (`first-day`) |
| 2 The printer on the 2nd floor (`cat`) | `printer-floor2` | 1 (`left-behind`) |
| 3 New project folders (`mkdir`, `touch`) | `project-folders` | 2 (`tidying-up`) |
| 4 Backup before the switch update (`cp`, `mv`) | `switch-backup` | 2 (`tidying-up`) |
| 5 Disk full (`rm`) | `disk-full` | 2 (`tidying-up`, incident) |

## Later (ideas, not planned)

Firewall (`ufw`, `nftables`), web server configuration (nginx), Docker basics, disks (`lsblk`,
`mount`, `fstab`), `sed` and `awk`, `git`, a `vim` side chapter, a Rocky Linux side chapter,
the small simulated internet.
