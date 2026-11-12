# Claude Code on the desk buddy

The buddy shows what Claude Code is doing: it reads along while Claude reads,
types while Claude edits, watches the pipeline while tests run, cheers when
they pass, raises a prompt when Claude needs your permission, and says "Done"
when the turn ends. A minute later it goes back to whatever it was playing.

It uses Claude Code hooks, the `claude` theme animations and the buddy's HTTP
API over Wi-Fi. There is nothing to flash and nothing to install besides the
hooks, and it needs only the Python 3 standard library.

## Setup

```sh
# 1. the animations (once; they live on the buddy's file system)
sim/test/push_all.sh 192.168.50.99 '^Claude'

# 2. the hooks, in ~/.claude/settings.json (existing hooks are kept, a backup is written)
python3 claude_integration/buddy_bridge.py install --host 192.168.50.99

# 3. check: hooks, buddy, and which animation each activity plays
python3 claude_integration/buddy_bridge.py status
python3 claude_integration/buddy_bridge.py demo        # plays every activity, 5 s each
```

Claude Code reloads its settings, so sessions that are already running start
showing on the buddy right away (checked with Claude Code 2.1.322). Use the
buddy's IP address rather than `desk-buddy.local`: mDNS lookups can
take a second or fail on some networks.

## What it shows

| Claude Code | Activity | Buddy plays |
|---|---|---|
| a session starts | hello | `claude__hello` (once) |
| you send a prompt, or Claude is thinking between tools | thinking | `claude__pondering`, alternating with `claude__thinking` when it takes long |
| plan mode | planning | `claude__plan_mode` |
| Read, `cat`, `head`, `sed -n` | reading | `claude__reading` |
| Grep, Glob, WebSearch, WebFetch, `grep`, `find`, `ls` | searching | `claude__searching` |
| Edit, NotebookEdit | editing | `claude__editing` |
| Write a code file / a `.md` or `.txt` | coding / writing | `claude__coding` / `claude__writing` |
| Edit or Write a `.py`, `.c`/`.h`, `.cpp`, `.go`, `.rs`, `.js`, `.ts`, `.java`, `.sql` or `.sh` file | python, c, cpp, go, rust, javascript, typescript, java, sql, bash | `claude__python` etc. if that animation is on the buddy (optional, about 320 KB for all ten), otherwise as above |
| any other shell command, builds | running | `claude__coding` |
| a test command (`pytest`, `npm test`, `go test`, `run_tests.sh`…) | testing | `claude__ci_pipeline` |
| … and it passes | passed | `claude__tests_pass` (once) |
| a test, build or push fails | failed | `claude__build_failed` (once), then `claude__debugging` |
| another command fails (not `grep`, `ls`, `test`…) | debugging | `claude__debugging`, alternating with `claude__rubber_duck` |
| `git commit`, `checkout`, `rebase`, `merge` | git | `claude__git_graph` |
| a merge or rebase stops on a conflict | conflict | `claude__merge_conflict` (once) |
| `git diff`, `git show`, `gh pr view`, `/review` | reviewing | `claude__code_review` |
| `git push`, `gh pr create` | shipping | `claude__ship_it` |
| `gh run`, `gh pr checks` | ci | `claude__ci_pipeline` |
| TodoWrite / the task list | todo | `claude__todo_list` |
| subagents running (Agent tool) | subagents | `claude__subagents` |
| compacting the conversation | compacting | `claude__compacting` |
| a command running for over 3 minutes | long_run | `claude__infinite_loop` |
| a permission prompt, AskUserQuestion, plan approval, MCP input | attention | `claude__permission` |
| the turn ends | done | `claude__done` for a minute, then back to the previous face |

Each activity lists fallbacks (`ACTIVITIES` in `buddy_bridge.py`). If an
animation is not on the buddy, the next one that is gets played, so a buddy
with only a few of the theme's animations still reacts. `status` shows what
each activity resolves to.

## How it works

```mermaid
sequenceDiagram
    participant C as Claude Code
    participant H as buddy_bridge.py hook
    participant D as daemon (127.0.0.1:47615)
    participant B as desk buddy
    C->>H: hook event JSON on stdin
    H->>D: POST /event {session, activity}
    Note over H: exits (about 50 ms); starts the daemon if needed
    D->>B: GET /api/status (first activity: remember what it was playing)
    D->>B: POST /api/play?name=claude__reading
    Note over D: ...until every session is idle
    D->>B: POST /api/play?name=cycle (or the previous face)
```

- **The hook never waits for the buddy.** It classifies the event, hands a
  few bytes to the daemon on localhost and exits. If the buddy is off or out
  of reach, Claude Code does not notice. The hook prints nothing (on some
  events Claude Code would add hook output to the conversation) and always
  exits 0.
- **The daemon** starts itself on the first event and exits after 30 quiet
  minutes. It keeps one state per Claude Code session and decides what to
  show:
  1. any session waiting for you → `attention`, at once;
  2. one-off outcomes (tests passed, build failed, conflict, hello), each
     shown for about one loop;
  3. otherwise the activity of the session that did something most recently;
  4. `done` while a session finished less than `done_seconds` ago;
  5. otherwise idle: the buddy goes back to what it was playing before Claude
     started (read from `/api/status`, usually `cycle`). If someone picked
     another face on the buddy in the meantime, that face is left alone.
- **No flicker.** Claude Code can run several tools per second. An activity
  stays on screen at least `min_seconds`, and after that the latest one wins.
  Playing the same animation again is skipped (each play restarts the
  animation and reloads it from flash). After you answer a prompt the face
  changes immediately.
- **Parallel tools.** A question stays up while results of other tools from
  the same batch come in; it clears when its own tool finishes or Claude
  moves on.
- **Interrupts.** Esc during a tool call shows up as an interrupted tool
  result and puts the buddy back. Esc while Claude is only thinking sends no
  hook event, so the buddy goes back after `idle_seconds`.

## Settings

`~/.config/desk-buddy/claude.json` (written by `install`; every key is
optional):

| Key | Default | Meaning |
|---|---|---|
| `host` | `desk-buddy.local` | the buddy's address; `DESK_BUDDY_HOST` in the environment overrides it |
| `enabled` | `true` | `pause` / `resume` switch this |
| `min_seconds` | 3 | shortest time an activity stays on screen |
| `think_after` | 8 | seconds after a tool finished with nothing new before showing thinking |
| `done_seconds` | 60 | how long "done" stays |
| `idle_seconds` | 300 | no event for this long while working counts as idle (a running command extends it by its timeout) |
| `attention_seconds` | 1800 | "needs you" gives up after this |
| `long_run_seconds` | 180 | a command running longer shows the infinite loop; 0 turns it off |
| `rotate_seconds` | 30 | long thinking / debugging alternates animations at this interval |
| `restore` | `previous` | when idle: `previous`, `cycle`, or an animation name |
| `animations` | `{}` | per-activity override, e.g. `{"done": "face_happy", "thinking": ["claude__thinking"]}` |
| `port` | 47615 | the daemon's local port |

After changing settings, run `buddy_bridge.py stop`; the next event starts
the daemon with the new values.

## Commands

| Command | Does |
|---|---|
| `install [--host H] [--settings F]` | add the hooks (to `~/.claude/settings.json`, or e.g. a project's `.claude/settings.json`), save the host, show what each activity will play |
| `status` | hooks installed?, daemon and its sessions, recent plays, buddy reachability, activity → animation table |
| `demo [--seconds 5] [--only a,b]` | play each activity on the buddy, then put it back |
| `pause` / `resume` | stop / start showing Claude (the hooks stay installed) |
| `stop` | stop the daemon; the buddy goes back first |
| `uninstall [--settings F]` | remove only this bridge's hook entries |

To keep one session off the buddy, start it with `DESK_BUDDY=0 claude`.
`pause` covers every session, for example while testing firmware on the
board.

## Troubleshooting

- **Nothing happens.** Run `status`. "not installed": run `install`.
  "no answer from the buddy": check the address and that this computer is on
  the same network. "daemon: not running" is normal until the next Claude
  Code event. If an older Claude Code does not reload settings, restart the
  session.
- **The wrong animation, or a stand-in.** `status` marks activities whose
  first choice is not on the buddy; push the theme again
  (`sim/test/push_all.sh <host> '^Claude'`). The board holds about 1.9 MB,
  and the full Claude theme takes about 520 KB of it.
- **Log.** `~/.config/desk-buddy/claude-bridge.log` lists each switch
  (`reading -> claude__reading`), buddy errors and restores.

## Files

| File | Role |
|---|---|
| `buddy_bridge.py` | hook client, daemon, installer and CLI (one file, standard library) |
| `test_bridge.py` | `python3 claude_integration/test_bridge.py`: event classification, display rules with a fake clock, and the real hook and daemon against a fake buddy |
