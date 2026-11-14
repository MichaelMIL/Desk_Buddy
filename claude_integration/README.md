# Claude Code on the desk buddy

The buddy shows what Claude Code is doing: it reads along while Claude reads,
types while Claude edits, watches the pipeline while tests run, cheers when
they pass, raises a prompt when Claude needs your permission, and says "Done"
when the turn ends. A minute later it goes back to whatever it was playing.

It uses Claude Code hooks and the `claude` theme animations. It talks to the
buddy over Bluetooth LE (the build without Wi-Fi, or the Wi-Fi build with
Bluetooth on) or over Wi-Fi. There is nothing to flash. Over Wi-Fi it needs
only the Python 3 standard library; over Bluetooth it also needs `bleak`
(`python3 -m pip install bleak`).

## Setup

Over Bluetooth:

```sh
# 1. the animations (once; they live on the buddy's file system)
sim/test/push_all.sh ble '^Claude'

# 2. the hooks, in ~/.claude/settings.json (existing hooks are kept, a backup is written)
python3 claude_integration/buddy_bridge.py install --host ble

# 3. check: hooks, buddy, and which animation each activity plays
python3 claude_integration/buddy_bridge.py status
python3 claude_integration/buddy_bridge.py demo        # plays every activity, 5 s each
```

The first Bluetooth connection from this Mac pairs: the buddy shows a 6-digit
code and macOS asks for it. If step 1 already paired, `install` connects
without a prompt. `ble:<name>` picks one buddy by its device name when there
are several.

Over Wi-Fi, use the buddy's address instead of `ble` in steps 1 and 2, e.g.
`--host 192.168.50.99`. Use the IP address rather than `desk-buddy.local`:
mDNS lookups can take a second or fail on some networks.

Claude Code reloads its settings, so sessions that are already running start
showing on the buddy right away (checked with Claude Code 2.1.322). Running
`install` again with another `--host` switches over; it restarts the daemon.

### Sharing the Bluetooth link

The buddy takes one Bluetooth connection at a time. The bridge connects when
it has something to show and disconnects 20 s (`ble_linger_seconds`) after
its last command. While Claude works through tools, the link stays up and a
command takes a fraction of a second. During a permission prompt, a long
command, or "done", it is free, and the phone app, the remote page or
`push_all.sh ble` can connect.

- **Uploading from this computer.** An upload over Bluetooth must not get a
  command in the middle. A program that uploads can ask the bridge to keep
  off first: `buddy_bridge.py hold 120` (or `POST /hold {"seconds": 120}` to
  `127.0.0.1:47615` with the header `X-Desk-Buddy: 1`) disconnects at once
  and sends nothing for that long; `hold 0` ends it early.
- **Other apps on the same Mac.** A buddy that another app on this Mac is
  connected to (the remote page in Chrome, the phone app's macOS build) does
  not advertise, but CoreBluetooth shares the link. The bridge looks for such
  a connection before it scans, so it works next to them. Do not upload from
  such an app while Claude is working, or `pause` the bridge first.
- **Using the phone for a while:** `buddy_bridge.py pause`, then `resume`.

### Putting deleted animations back (the library)

`~/.config/desk-buddy/library` holds a copy of every animation: `sim/serve.py`
saves each one it pushes, and `sim/test/library.sh` exports them all from the
simulator. When the animation for an activity is not on the buddy but is in
the library, the bridge shows the best one the buddy has at once, uploads the
real one (about 7 s for 15 KB over Bluetooth), and switches to it if the
activity is still on. A face picked in the menu bar app that is no longer on
the buddy is uploaded first, then played.

When the buddy says it is full, the bridge deletes animations to make room:
only ones the library can put back, never what is showing, what it goes back
to, or a built-in one. It deletes other themes' faces and the optional
language and studio animations before faces that cycle and the core Claude
ones, and the least recently played first within each
(`~/.config/desk-buddy/claude-plays.json`). A `hold` waits for an upload in
progress to finish, then keeps the bridge off. `auto_upload` (Settings) limits
or turns off the uploads the bridge starts on its own.

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
| Edit or Write a `.py`, `.c`/`.h`, `.cpp`, `.go`, `.rs`, `.js`, `.ts`, `.java`, `.sql` or `.sh` file | python, c, cpp, go, rust, javascript, typescript, java, sql, bash | `claude__python` etc. if that animation is on the buddy, otherwise as above |
| Edit or Write code in another language (`.rb`, `.swift`, `.kt`, `.php`, `.lua`, `.cs`…) | polyglot | `claude__polyglot` if on the buddy, otherwise as above |
| Edit or Write a 3D model (`.scad`, `.stl`, `.3mf`, `.step`, `.blend`…), or run `openscad`, `blender`, a slicer | 3d_modeling | `claude__3d_modeling` if on the buddy, otherwise as above |
| Edit or Write a stylesheet or design file (`.css`, `.scss`, `.less`, `.svg`…) | designing | `claude__designing` if on the buddy, otherwise as above |
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
    D->>B: state (first activity: remember what it was playing)
    D->>B: play claude__reading
    Note over D: ...until every session is idle
    D->>B: play cycle (or the previous face)
    Note over D,B: Bluetooth: disconnect 20 s later
```

Over Bluetooth these are the buddy's console commands (`state`, `names`,
`play <name>`) on the Nordic UART Service ([hardware/BLE.md](../hardware/BLE.md)),
sent with `bleak` from an asyncio loop in the daemon. Over Wi-Fi they are
`GET /api/status` and `POST /api/play` ([hardware/API.md](../hardware/API.md)).

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
     started (read from its state, usually `cycle`). If someone picked
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
| `host` | `desk-buddy.local` | `ble` or `ble:<device name>` for Bluetooth, otherwise the buddy's IP address or name on Wi-Fi; `DESK_BUDDY_HOST` in the environment overrides it |
| `ble_linger_seconds` | 20 | Bluetooth: how long after Claude goes idle the link is kept before disconnecting |
| `enabled` | `true` | `false` = manual; `pause` / `resume` switch this |
| `min_seconds` | 3 | shortest time an activity stays on screen |
| `think_after` | 8 | seconds after a tool finished with nothing new before showing thinking |
| `done_seconds` | 60 | how long "done" stays |
| `idle_seconds` | 300 | no event for this long while working counts as idle (a running command extends it by its timeout) |
| `attention_seconds` | 1800 | "needs you" gives up after this |
| `long_run_seconds` | 180 | a command running longer shows the infinite loop; 0 turns it off |
| `rotate_seconds` | 30 | long thinking / debugging alternates animations at this interval |
| `restore` | `previous` | when idle: `previous`, `cycle`, or an animation name |
| `animations` | `{}` | per-activity override, e.g. `{"done": "face_happy", "thinking": ["claude__thinking"]}` |
| `auto_upload` | `all` | an activity's animation missing on the buddy but in the library: `all` uploads it, `core` all but the language and studio ones, `off` never (menu bar picks are still uploaded) |
| `port` | 47615 | the daemon's local port |

After changing settings, run `buddy_bridge.py stop`; the next event starts
the daemon with the new values.

## Commands

| Command | Does |
|---|---|
| `install [--host H] [--settings F]` | add the hooks (to `~/.claude/settings.json`, or e.g. a project's `.claude/settings.json`), save the host, show what each activity will play |
| `status` | hooks installed?, daemon and its sessions, recent plays, buddy reachability, activity → animation table |
| `demo [--seconds 5] [--only a,b]` | play each activity on the buddy, then put it back |
| `pause` / `resume` | manual: Claude Code stops changing the animation, the buddy goes back to what it played before Claude, and you pick from then on (the hooks stay installed; a running daemon stays up for the menu bar app's controls and lets go of the Bluetooth link at once) / follow Claude Code again |
| `hold [seconds]` | leave the buddy alone for a while (default 120 s; frees the Bluetooth link at once); `hold 0` ends it |
| `start` | start the daemon now (otherwise it starts with the next Claude Code event) |
| `stop` | stop the daemon; the buddy goes back first, and it returns once the daemon has exited (up to 60 s), so `stop && start` starts a fresh one |
| `uninstall [--settings F]` | remove only this bridge's hook entries |

To keep one session off the buddy, start it with `DESK_BUDDY=0 claude`.
`pause` covers every session, for example while testing firmware on the
board.

## Menu bar app (macOS)

`menubar/` is **Buddy Bridge**, a menu bar app (macOS 13 or later, Swift).
It shows whether the bridge is running and what it shows. The icon follows the
activity: a book for reading, a pencil for editing, a speech bubble with "!"
when a session waits for you. It also shows a pointing hand in Manual, a moon
when the daemon is not running (normal until the next Claude Code event), a
raised hand during a `hold`, and a warning sign when the hooks are missing or
the buddy does not answer. Click the icon for a panel with:

- the state and the animation on the buddy;
- the link (Bluetooth or Wi-Fi), whether it is connected, the buddy's battery
  (red when low, a bolt while charging; hidden without one), and what the
  buddy goes back to;
- buddy controls: what it plays, brightness and screen on/off; in Manual and
  Cycle also next face (Bluetooth) and a menu of every face by theme, and in
  Cycle which theme's faces join the cycle (one per `<theme>__` prefix among
  the stored animations);
- each session: project folder, activity, subagents, last event;
- the last few animations shown;
- a **Follow Claude / Manual / Cycle** switch. Manual and Cycle both stop
  Claude Code changing the animation (`pause`). In Manual the face you pick
  stays; coming from Cycle it goes back to the last face you picked. In Cycle
  the buddy goes through the common faces plus the selected theme's, and
  picking a face switches to Manual;
- "Leave the buddy alone for 2 min" (`hold`), Stop, Open log, and Open at
  login.

The controls go through the daemon, which owns the link (the buddy takes one
Bluetooth connection): `GET /buddy` reads the buddy, `POST /buddy
{"command": "brightness 60"}` sends one of `play`, `cycle`, `next`,
`brightness`, `screen` or `theme` (over Wi-Fi each maps onto its HTTP
endpoint; there is no `next`). Both answer `{"ok", "reply", "error",
"buddy", "commands"}`; 409 during a `hold`, 502 when the buddy does not answer.
`buddy.battery` (and `battery` in `GET /status`, from the last state the daemon
read) is `{"pct": 64, "low": false}` over both links (plus `"mv"` over Wi-Fi, and
`"charging": true` or `"charged": true` while on the charger), or `null` without
a battery; `buddy_bridge.py status` prints it too.
The app reads the buddy only while its panel is open, so the link is free
otherwise. If the daemon is not running, "Show buddy controls" starts it
(`buddy_bridge.py start`) with the Python it last ran with, recorded in
`~/.config/desk-buddy/claude-python`, because a GUI app's `python3` may lack
bleak. Faces are picked in Manual or Cycle; while following Claude, Claude
Code picks them, so the panel shows only what plays, brightness and screen
(opening the panel in Manual or Cycle connects to the buddy at once).

```sh
claude_integration/menubar/build.sh --install   # builds, copies to ~/Applications, starts it
```

It needs only the Swift toolchain that comes with Xcode or the Command Line
Tools; `build.sh` without `--install` leaves the app in `menubar/build/`. It
polls `GET /status` on the daemon (`127.0.0.1:47615`, header `X-Desk-Buddy:
1`) every 1.5 s, and reads `claude.json` and `~/.claude/settings.json`. The
Follow Claude / Manual / Cycle switch runs `buddy_bridge.py resume` / `pause`,
then for Manual and Cycle sends `play <face>` or `cycle`; which of the two is
showing comes from the buddy (cycling or not). The app keeps no state of its
own beyond the last face picked, in memory. Tests: `cd claude_integration/menubar && swift
test` (status parsing, state rules, and that every icon exists).

## Troubleshooting

- **Nothing happens.** Run `status`. "not installed": run `install`.
  "daemon: not running" is normal until the next Claude Code event. "no
  answer over Bluetooth": the buddy is out of range, another device (a phone,
  a Chrome tab on another computer) hold both its connections, or this Mac is
  not paired. Run `install --host ble` again to pair. If no code prompt shows
  up and it still fails, the buddy forgot the bond (`ble forget`, factory
  reset, or another build was flashed), so remove "Desk Buddy" in macOS
  Bluetooth settings and pair again. "no answer from http://…": check the
  address and that this computer is on the same network. If an older Claude Code does not reload settings, restart the
  session.
- **The wrong animation, or a stand-in.** `status` marks activities whose
  first choice is not on the buddy; push the theme again
  (`sim/test/push_all.sh ble '^Claude'`, or the Wi-Fi address instead of
  `ble`). Switching between the Wi-Fi build and the build without Wi-Fi erases
  the stored animations, so push again after that. The core Claude theme takes
  about 520 KB and the eleven language animations (`theme_claude_langs.js`)
  another 320 KB; the build without Wi-Fi has about 3.3 MB for animations, the
  Wi-Fi build about 1.9 MB.
- **The phone app, remote page or a Bluetooth push cannot connect.** The
  buddy takes two devices at once, and the bridge holds one link while Claude
  is busy with tools. `hold` or `pause` frees it at once; otherwise it is free
  20 s after the bridge's last command. (Tapping a face on the phone while the
  bridge plays one makes the buddy look confused for a moment, then it shows
  the face you tapped.) They are optional, and
  `status` lists the ones on the buddy.
- **Log.** `~/.config/desk-buddy/claude-bridge.log` lists each switch
  (`reading -> claude__reading`), buddy errors and restores.

## Files

| File | Role |
|---|---|
| `buddy_bridge.py` | hook client, daemon, installer and CLI (one file, standard library) |
| `test_bridge.py` | `python3 claude_integration/test_bridge.py`: event classification, display rules with a fake clock, and the real hook and daemon against a fake buddy |
| `menubar/` | the Buddy Bridge menu bar app (Swift package; `build.sh`, `swift test`) |
