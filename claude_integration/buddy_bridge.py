#!/usr/bin/env python3
"""
buddy_bridge.py - shows what Claude Code is doing on the desk buddy.

Claude Code runs `buddy_bridge.py hook` on its hook events (reading a file,
editing, running tests, waiting for permission, done...). The hook turns the
event into a small message and hands it to a background daemon on
127.0.0.1, which picks an animation from the `claude` theme and tells the
buddy over Wi-Fi (POST /api/play). The hook never waits for the buddy, so
Claude Code is not slowed down; the daemon starts itself on the first event
and exits after half an hour of quiet.

  buddy_bridge.py install --host 192.168.50.99   add the hooks to ~/.claude/settings.json
  buddy_bridge.py status                         hooks, daemon, buddy, which animation each activity plays
  buddy_bridge.py demo                           play every activity on the buddy, then put it back
  buddy_bridge.py pause | resume                 stop / start reflecting Claude on the buddy
  buddy_bridge.py stop                           stop the daemon (puts the buddy back first)
  buddy_bridge.py uninstall                      remove the hooks

Python 3.8+, standard library only. See README.md next to this file.
"""
import argparse
import collections
import http.client
import json
import os
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.abspath(__file__)
CONF_DIR = os.environ.get('DESK_BUDDY_HOME') or os.path.join(os.path.expanduser('~'), '.config', 'desk-buddy')
CONF_FILE = os.path.join(CONF_DIR, 'claude.json')
STATE_FILE = os.path.join(CONF_DIR, 'claude-state.json')
LOG_FILE = os.path.join(CONF_DIR, 'claude-bridge.log')
SETTINGS_FILE = os.path.join(os.path.expanduser('~'), '.claude', 'settings.json')
HOOK_MARK = 'buddy_bridge.py'            # how install/uninstall recognise our hook entries
HEADER = 'X-Desk-Buddy'                  # required on daemon requests (keeps web pages from posting to it)

DEFAULTS = {
    'host': 'desk-buddy.local',          # the buddy: IP address or mDNS name
    'port': 47615,                       # the local daemon (127.0.0.1)
    'enabled': True,                     # false = hooks do nothing (buddy_bridge.py pause)
    'min_seconds': 3.0,                  # an activity stays on screen at least this long
    'think_after': 8.0,                  # a tool finished and nothing new for this long: back to thinking
    'done_seconds': 60,                  # "done" stays this long after Claude stops, then the buddy goes back
    'idle_seconds': 300,                 # no hook event for this long while working: treat as idle
    'attention_seconds': 1800,           # "needs you" gives up after this long
    'long_run_seconds': 180,             # a command running longer than this shows the infinite loop (0 = off)
    'rotate_seconds': 30,                # long thinking / debugging alternates between its animations
    'restore': 'previous',               # when Claude is idle: 'previous' (what was playing), 'cycle', or a name
    'animations': {},                    # overrides: {"thinking": "claude__thinking", "done": ["face_happy"]}
}

# Activity -> animations on the buddy, best first. The first one stored on the
# buddy plays, so a board without the whole claude theme still shows something.
ACTIVITIES = collections.OrderedDict([
    ('hello',      ['claude__hello', 'claude__spark']),
    ('thinking',   ['claude__pondering', 'claude__thinking', 'claude__spark']),
    ('planning',   ['claude__plan_mode', 'claude__thinking', 'claude__pondering']),
    ('reading',    ['claude__reading', 'claude__thinking', 'claude__pondering']),
    ('searching',  ['claude__searching', 'claude__reading', 'claude__debugging', 'claude__pondering']),
    ('editing',    ['claude__editing', 'claude__coding', 'claude__writing']),
    ('coding',     ['claude__coding', 'claude__editing', 'claude__writing']),
    ('writing',    ['claude__writing', 'claude__editing', 'claude__coding']),
    ('running',    ['claude__coding', 'claude__pondering']),
    ('testing',    ['claude__ci_pipeline', 'claude__coding', 'claude__pondering']),
    ('passed',     ['claude__tests_pass', 'claude__done', 'claude__spark']),
    ('failed',     ['claude__build_failed', 'claude__debugging']),
    ('debugging',  ['claude__debugging', 'claude__rubber_duck', 'claude__searching']),
    ('git',        ['claude__git_graph', 'claude__coding']),
    ('conflict',   ['claude__merge_conflict', 'claude__build_failed', 'claude__debugging']),
    ('shipping',   ['claude__ship_it', 'claude__git_graph']),
    ('reviewing',  ['claude__code_review', 'claude__reading']),
    ('ci',         ['claude__ci_pipeline', 'claude__pondering']),
    ('todo',       ['claude__todo_list', 'claude__plan_mode', 'claude__writing']),
    ('subagents',  ['claude__subagents', 'claude__thinking', 'claude__pondering']),
    ('compacting', ['claude__compacting', 'claude__pondering']),
    ('long_run',   ['claude__infinite_loop', 'claude__pondering']),
    ('attention',  ['claude__permission', 'claude__hello', 'face_surprised']),
    ('done',       ['claude__done', 'claude__spark', 'claude__tests_pass', 'face_happy']),
])
# Editing or writing code in a language with its own animation (sim/animations/theme_claude_langs.js);
# without it on the buddy, the edit shows as editing.
LANGS = {'.py': 'python', '.pyi': 'python', '.ipynb': 'python',
         '.c': 'c', '.h': 'c',
         '.cc': 'cpp', '.cpp': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.hh': 'cpp', '.ino': 'cpp',
         '.go': 'go', '.rs': 'rust', '.java': 'java', '.sql': 'sql',
         '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
         '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript',
         '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash'}
for _lang in sorted(set(LANGS.values())):
    ACTIVITIES[_lang] = ['claude__' + _lang, 'claude__editing', 'claude__coding']
OPTIONAL = set(LANGS.values())          # not part of the core theme; `status` does not ask to push them
# Activities that alternate between animations when they last (every rotate_seconds).
ROTATE = {'thinking': ['claude__pondering', 'claude__thinking'],
          'debugging': ['claude__debugging', 'claude__rubber_duck']}
# One-off outcomes: shown once, for about one loop of the animation, then back to the activity.
FLASH_SECONDS = {'hello': 4.0, 'passed': 5.2, 'failed': 5.0, 'conflict': 5.0}
# Activities that stay after their tool finished (others fall back to thinking after think_after).
STICKY = {'thinking', 'planning', 'debugging', 'compacting', 'subagents', 'done'}

HOOK_EVENTS = ['SessionStart', 'SessionEnd', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse',
               'PostToolUseFailure', 'PermissionRequest', 'Notification', 'Elicitation', 'Stop',
               'StopFailure', 'SubagentStart', 'SubagentStop', 'PreCompact', 'PostCompact']
POST = ('PostToolUse', 'PostToolUseFailure')


# ---------------------------------------------------------------------------- config and log

def load_config():
    cfg = dict(DEFAULTS)
    try:
        with open(CONF_FILE) as f:
            cfg.update(json.load(f))
    except (OSError, ValueError):
        pass
    if os.environ.get('DESK_BUDDY_HOST'):
        cfg['host'] = os.environ['DESK_BUDDY_HOST']
    return cfg


def save_config(cfg):
    os.makedirs(CONF_DIR, exist_ok=True)
    tmp = CONF_FILE + '.tmp'
    with open(tmp, 'w') as f:
        json.dump(cfg, f, indent=2)
        f.write('\n')
    os.replace(tmp, CONF_FILE)


def log(msg):
    try:
        os.makedirs(CONF_DIR, exist_ok=True)
        with open(LOG_FILE, 'a') as f:
            f.write(time.strftime('%Y-%m-%d %H:%M:%S ') + msg + '\n')
    except OSError:
        pass


# ---------------------------------------------------------------------------- hook event -> message

DOC_EXT = ('.md', '.markdown', '.txt', '.rst', '.adoc', '.org', '.tex')
READ_CMDS = {'cat', 'head', 'tail', 'less', 'more', 'bat', 'sed', 'awk', 'jq', 'wc', 'file', 'xxd',
             'hexdump', 'strings', 'diff', 'cmp', 'stat', 'du', 'df', 'readlink', 'realpath'}
SEARCH_CMDS = {'grep', 'egrep', 'rg', 'ag', 'ack', 'find', 'fd', 'ls', 'tree', 'which', 'whereis',
               'locate', 'mdfind', 'pgrep', 'lsof', 'ps', 'test', '['}
PREFIXES = {'sudo', 'time', 'nice', 'nohup', 'env', 'command', 'exec', 'timeout', 'caffeinate', 'xargs'}
SETUP_CMDS = {'cd', 'pushd', 'popd', 'export', 'source', '.', 'set', 'unset', 'true', 'sleep', 'echo', 'printf'}
TEST_RE = re.compile(
    r'\b(pytest|py\.test|jest|vitest|mocha|rspec|phpunit|ctest|tox|nox|unittest)\b'
    r'|\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b'
    r'|\b(go|cargo|swift|dotnet|mix|deno|zig|pio|platformio)\s+test\b'
    r'|\bmake\s+(test|check)\b'
    r'|\b(gradlew?|mvn)\b[^|;&]*\btest\b'
    r'|\brun_tests\b|\bsmoke\.sh\b')
BUILD_RE = re.compile(
    r'\b(make|cmake|ninja|tsc|webpack|xcodebuild)\b'
    r'|\b(npm|pnpm|yarn|bun)\s+(run\s+)?build\b|\bvite\s+build\b'
    r'|\b(cargo|go|swift|dotnet)\s+build\b|\b(pio|platformio)\s+run\b'
    r'|\bgradlew?\s+\S*(build|assemble)|\bmvn\s+(package|compile|install)\b')
FAIL_TEXT_RE = re.compile(r'\b[1-9]\d* (failed|failing|errors?)\b|^FAIL(ED)?\b', re.M)


def _strip_quotes(cmd):
    """Blank out quoted strings, so `git commit -m "fix pytest"` is not a test run."""
    return re.sub(r"'[^']*'|\"(?:[^\"\\]|\\.)*\"", "''", cmd)


def _main_command(cmd):
    """First word of the first segment that does real work (skips cd, env assignments, sudo...)."""
    for seg in re.split(r'&&|\|\||;|\||\n', cmd):
        toks = seg.split()
        while toks and (toks[0] in PREFIXES or re.match(r'^[A-Za-z_]\w*=', toks[0])
                        or re.match(r'^(-\S+|\d+[smhd]?)$', toks[0])):
            toks.pop(0)
        if toks and os.path.basename(toks[0]) not in SETUP_CMDS:
            return os.path.basename(toks[0]), ' '.join(toks)
    return '', ''


def bash_activity(cmd):
    """(activity, kind) for a shell command; kind says how its outcome is shown:
    test, build, push, merge, query (failure means nothing) or None."""
    s = _strip_quotes(cmd or '')
    low = s.lower()
    if re.search(r'\bgit\s+(-C\s+\S+\s+)?push\b', s) or re.search(r'\bgh\s+pr\s+(create|merge)\b', low):
        return 'shipping', 'push'
    if TEST_RE.search(low):
        return 'testing', 'test'
    if re.search(r'\bgh\s+(run|workflow)\b|\bgh\s+pr\s+checks\b', low):
        return 'ci', 'query'
    if re.search(r'\bgit\s+(-C\s+\S+\s+)?(merge|rebase|cherry-pick|pull|revert)\b', s):
        return 'git', 'merge'
    first, seg = _main_command(s)
    if first == 'git':
        m = re.search(r'\bgit\s+(?:-C\s+\S+\s+|-c\s+\S+\s+)*([a-z][a-z-]*)', seg)
        sub = m.group(1) if m else ''
        if sub in ('diff', 'show', 'blame'):
            return 'reviewing', 'query'
        return 'git', 'query' if sub in ('status', 'log', 'branch', 'rev-parse', 'ls-files') else None
    if first == 'gh' and re.search(r'\bpr\s+(view|diff|review)\b', seg):
        return 'reviewing', 'query'
    if BUILD_RE.search(low):
        return 'running', 'build'
    if first in READ_CMDS:
        return 'reading', 'query'
    if first in SEARCH_CMDS:
        return 'searching', 'query'
    return 'running', None


def tool_activity(tool, tin, plan=False):
    """Activity for a tool that is about to run."""
    if tool == 'Bash':
        return bash_activity(tin.get('command', ''))[0]
    if tool in ('Read', 'NotebookRead') or tool.startswith('ReadMcpResource'):
        return 'reading'
    if tool in ('Grep', 'Glob', 'LS', 'WebSearch', 'WebFetch', 'ToolSearch', 'LSP', 'ListMcpResourcesTool'):
        return 'searching'
    if tool in ('Edit', 'MultiEdit', 'NotebookEdit', 'Write'):
        path = str(tin.get('file_path') or tin.get('notebook_path') or '').lower()
        ext = os.path.splitext(path)[1]
        if ext in LANGS:
            return LANGS[ext]
        if tool == 'Write':
            return 'writing' if path.endswith(DOC_EXT) else 'coding'
        return 'editing'
    if tool in ('Agent', 'Task', 'Workflow'):
        return 'subagents'
    if tool in ('TodoWrite', 'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet'):
        return 'todo'
    if tool in ('AskUserQuestion', 'ExitPlanMode'):
        return 'attention'                        # both put a question in front of the user
    if tool == 'EnterPlanMode':
        return 'planning'
    if tool.startswith('mcp__'):
        n = tool.lower().split('__')[-1]
        if any(k in n for k in ('search', 'query', 'find', 'list', 'get', 'read', 'fetch', 'view', 'navigate')):
            return 'searching'
        if any(k in n for k in ('create', 'update', 'write', 'edit', 'send', 'post', 'add', 'upload', 'comment')):
            return 'writing'
    return 'planning' if plan else 'thinking'


def prompt_activity(prompt, plan=False):
    p = (prompt or '').strip().lower()
    if p.startswith(('/review', '/code-review', '/security-review', '/pr-comments')):
        return 'reviewing'
    if p.startswith('/compact'):
        return 'compacting'
    return 'planning' if plan or p.startswith('/plan') else 'thinking'


def classify(ev):
    """A Claude Code hook payload -> a small message for the daemon, or None to ignore it.
    Message keys: sid, ev, cwd, plan, tool, tool_id, act (the session's activity, or 'attention'),
    flash (a one-off outcome), bash_limit (seconds a foreground command may run), interrupt."""
    name = ev.get('hook_event_name') or ''
    tool = ev.get('tool_name') or ''
    tin = ev.get('tool_input') if isinstance(ev.get('tool_input'), dict) else {}
    m = {'sid': str(ev.get('session_id') or '?'), 'ev': name, 'cwd': ev.get('cwd') or '',
         'plan': ev.get('permission_mode') == 'plan'}
    if tool:
        m['tool'] = tool
    if ev.get('tool_use_id'):
        m['tool_id'] = ev['tool_use_id']

    if name == 'SessionStart':
        if ev.get('source') == 'startup':
            m['flash'] = 'hello'
        return m
    if name in ('SessionEnd', 'SubagentStart', 'SubagentStop'):
        return m
    if name == 'UserPromptSubmit':
        m['act'] = prompt_activity(ev.get('prompt'), m['plan'])
        return m
    if name in ('PermissionRequest', 'Elicitation'):
        m['act'] = 'attention'
        return m
    if name == 'Notification':
        kind = ev.get('notification_type') or ''
        text = str(ev.get('message') or '').lower()
        if kind in ('permission_prompt', 'elicitation_dialog') or (not kind and 'permission' in text):
            m['act'] = 'attention'
            return m
        return None                               # idle_prompt, auth_success: nothing to show
    if name == 'PreToolUse':
        m['act'] = tool_activity(tool, tin, m['plan'])
        if tool == 'Bash' and not tin.get('run_in_background'):
            try:
                m['bash_limit'] = max(1.0, float(tin.get('timeout') or 120000) / 1000)
            except (TypeError, ValueError):
                m['bash_limit'] = 120.0
        return m
    if name in POST:
        failed = name == 'PostToolUseFailure'
        if failed and ev.get('is_interrupt'):
            m['interrupt'] = True
            return m
        if tool == 'Bash':
            _, kind = bash_activity(tin.get('command', ''))
            if failed:
                out = str(ev.get('error') or '')
            else:
                resp = ev.get('tool_response')
                out = (str(resp.get('stdout') or '') + '\n' + str(resp.get('stderr') or '')) if isinstance(resp, dict) else str(resp or '')
            if kind == 'merge' and 'CONFLICT' in out:
                m['flash'] = 'conflict'
            elif kind in ('test', 'build', 'push') and (failed or (kind == 'test' and FAIL_TEXT_RE.search(out))):
                m['flash'] = 'failed'
                m['act'] = 'debugging'
            elif kind == 'test':
                m['flash'] = 'passed'
            elif failed and kind != 'query':
                m['act'] = 'debugging'
        return m
    if name == 'Stop':
        m['act'] = 'done'
        return m
    if name == 'StopFailure':
        m['flash'] = 'failed'
        return m
    if name == 'PreCompact':
        m['act'] = 'compacting'
        return m
    if name == 'PostCompact':
        m['act'] = 'thinking'
        return m
    return None


# ---------------------------------------------------------------------------- the buddy

class Board:
    """The buddy's HTTP API (hardware/src/net.cpp)."""

    def __init__(self, host, timeout=6.0):         # a play is ~0.1-0.3 s, but Wi-Fi power save can add seconds
        self.host = host
        self.timeout = timeout

    def _request(self, method, path):
        req = urllib.request.Request('http://%s%s' % (self.host, path), method=method,
                                     data=b'' if method == 'POST' else None)
        with urllib.request.urlopen(req, timeout=self.timeout) as r:
            return json.loads(r.read().decode() or '{}')

    def status(self):
        """dict with 'current' and 'animations', or None if the buddy does not answer."""
        try:
            return self._request('GET', '/api/status')
        except (OSError, ValueError, http.client.HTTPException):
            return None

    def play(self, name):
        """'ok', 'missing' (no such animation on the buddy) or 'down'."""
        try:
            self._request('POST', '/api/play?name=' + urllib.parse.quote(name))
            return 'ok'
        except urllib.error.HTTPError as e:
            return 'missing' if e.code == 404 else 'down'
        except (OSError, ValueError, http.client.HTTPException):
            return 'down'


def anim_names(status):
    out = set()
    for a in (status or {}).get('animations') or []:
        out.add(a.get('name') if isinstance(a, dict) else str(a))
    return out


# ---------------------------------------------------------------------------- the daemon's state

class Session:
    def __init__(self, sid):
        self.sid = sid
        self.act = None            # what the session is doing; None = idle
        self.act_at = 0.0          # when act last changed
        self.seen = 0.0            # last hook event
        self.cwd = ''
        self.plan = False
        self.tool_done = None      # when the last tool finished (no new one since)
        self.bash_since = None     # a foreground command is running since
        self.bash_limit = 0.0
        self.agents = 0            # subagents running
        self.attention = None      # waiting for the user since
        self.att_tool = None       # the tool the user is asked about
        self.ended = False         # SessionEnd came while showing done; dropped when done expires

    def set(self, act, now):
        if act != self.act:
            self.act, self.act_at = act, now


class Controller:
    """Turns hook messages into what the buddy should show, and shows it.
    apply() runs on the HTTP threads; tick() runs on the daemon's main loop."""

    def __init__(self, cfg, board, clock=time.monotonic):
        self.cfg, self.board, self.clock = cfg, board, clock
        self.lock = threading.RLock()
        self.sessions = {}
        self.flashes = collections.deque()      # (activity, queued at)
        self.shown = None                       # animation we last played
        self.shown_act = None
        self.hold_until = 0.0
        self.want = None
        self.want_since = 0.0
        self.active = False                     # we changed the buddy and have not put it back yet
        self.prev = None                        # what it was playing before
        self.names = None                       # animations on the buddy (None = unknown)
        self.names_at = -1e9
        self.board_retry = 0.0
        self.last_error = ''
        self.last_event = clock()
        self.history = collections.deque(maxlen=20)

    # -- events

    def apply(self, msg):
        now = self.clock()
        with self.lock:
            self.last_event = now
            sid, ev, act = msg.get('sid', '?'), msg.get('ev', ''), msg.get('act')
            if ev == 'SessionEnd':
                s = self.sessions.get(sid)
                if s is not None and s.act == 'done':
                    s.ended = True                # `claude -p` ends right after Stop: still show done
                else:
                    self.sessions.pop(sid, None)
                return
            s = self.sessions.get(sid)
            if s is None:
                s = self.sessions[sid] = Session(sid)
            s.seen, s.ended = now, False
            s.cwd = msg.get('cwd') or s.cwd
            s.plan = bool(msg.get('plan'))
            if act == 'attention':
                s.attention, s.att_tool = now, msg.get('tool_id')
                if ev == 'PreToolUse':
                    s.tool_done = None
                self.flashes.clear()
                return
            if s.attention is not None:
                # anything else means the question was answered, except the result of another tool
                # from the same parallel batch
                other = ev in POST and s.att_tool and msg.get('tool_id') and msg.get('tool_id') != s.att_tool
                if not other:
                    s.attention = s.att_tool = None
            if ev == 'PreToolUse':
                s.tool_done = None
                s.bash_limit = float(msg.get('bash_limit') or 0)
                s.bash_since = now if s.bash_limit else None
            elif ev in POST:
                s.tool_done, s.bash_since = now, None
                if msg.get('interrupt'):          # Esc: Claude stops and waits for the user
                    s.set(None, now)
                    s.agents = 0
                    return
            elif ev == 'SubagentStart':
                s.agents += 1
            elif ev == 'SubagentStop':
                s.agents = max(0, s.agents - 1)
            elif ev in ('Stop', 'StopFailure', 'UserPromptSubmit'):
                s.tool_done = s.bash_since = None
                if ev != 'UserPromptSubmit':
                    s.agents = 0
                if ev == 'StopFailure':
                    s.set(None, now)
            if act:
                s.set(act, now)
                if act == 'done':
                    s.act_at = now
            flash = msg.get('flash')
            if flash and not (self.flashes and self.flashes[-1][0] == flash):
                self.flashes.append((flash, now))
                while len(self.flashes) > 3:
                    self.flashes.popleft()

    # -- what to show

    def _expire(self, now):
        c = self.cfg
        for sid, s in list(self.sessions.items()):
            if s.attention is not None and now - s.attention > c['attention_seconds']:
                s.attention = s.att_tool = None
                s.set(None, now)
            if s.act == 'done':
                if now - s.act_at > c['done_seconds']:
                    s.set(None, now)
            elif s.act:
                busy = s.bash_since is not None and now < s.bash_since + s.bash_limit + 60
                if now - s.seen > c['idle_seconds'] and not busy:
                    s.set(None, now)
                    s.agents = 0
            if s.act is None and s.attention is None and (s.ended or now - s.seen > 3600):
                del self.sessions[sid]

    def _effective(self, s, now):
        c = self.cfg
        if s.agents > 0:
            return 'subagents'
        if s.bash_since is not None and c['long_run_seconds'] and now - s.bash_since > c['long_run_seconds']:
            return 'long_run'
        if s.tool_done is not None and now - s.tool_done > c['think_after'] and s.act not in STICKY:
            return 'planning' if s.plan else 'thinking'
        return s.act

    def desired(self, now):
        """(activity or None for idle, urgent)."""
        self._expire(now)
        if any(s.attention is not None for s in self.sessions.values()):
            return 'attention', True
        working = [s for s in self.sessions.values() if s.act and s.act != 'done']
        if working:
            return self._effective(max(working, key=lambda s: s.seen), now), False
        if any(s.act == 'done' for s in self.sessions.values()):
            return 'done', False
        return None, False

    def candidates(self, act):
        over = self.cfg.get('animations') or {}
        if act in over:
            v = over[act]
            return [v] if isinstance(v, str) else list(v)
        return ACTIVITIES.get(act, [])

    def resolve(self, act, held_for=0.0):
        """Animation name for an activity, given what is on the buddy; None if it has none of them."""
        have = (lambda n: True) if self.names is None else (lambda n: n in self.names)
        rot = self.cfg['rotate_seconds']
        if act in ROTATE and act not in (self.cfg.get('animations') or {}) and rot and held_for >= rot:
            alts = [n for n in ROTATE[act] if have(n)]
            if len(alts) > 1:
                return alts[int(held_for // rot) % len(alts)]
        for n in self.candidates(act):
            if have(n):
                return n
        return None

    # -- talking to the buddy (main loop only)

    def _board_ok(self, now):
        return now >= self.board_retry

    def _board_down(self, now, what):
        self.board_retry = now + 15
        if self.last_error != what:
            log('buddy at %s does not answer (%s); retrying every 15 s' % (self.cfg['host'], what))
        self.last_error = what

    def refresh_names(self, now, status=None):
        st = status or self.board.status()
        if st is None:
            self._board_down(now, 'status')
            return None
        self.names, self.names_at = anim_names(st), now
        self.last_error = ''
        return st

    def _activate(self, now):
        st = self.refresh_names(now)
        if st is None:
            return False
        cur = st.get('current') or 'cycle'
        self.prev = 'cycle' if cur.startswith('claude__') else cur
        self.active = True
        write_state({'prev': self.prev})
        log('Claude is active; the buddy was playing %s' % cur)
        return True

    def _show(self, name, act, now):
        if not self._board_ok(now):
            return False
        if not self.active and not self._activate(now):
            return False
        r = self.board.play(name)
        if r == 'ok':
            self.shown, self.shown_act = name, act
            self.history.append((time.strftime('%H:%M:%S'), act, name))
            log('%-10s -> %s' % (act, name))
            return True
        if r == 'missing':
            log('%s is not on the buddy; using the next choice for %s' % (name, act))
            if self.names is not None:
                self.names.discard(name)
            return False
        self._board_down(now, 'play')
        return False

    def restore(self, now):
        if not self._board_ok(now):
            return False
        st = self.board.status()
        if st is None:
            self._board_down(now, 'status')
            return False
        cur = st.get('current') or ''
        target = self.cfg.get('restore') or 'previous'
        if target == 'previous':
            target = self.prev or 'cycle'
        if cur == target:
            log('Claude is idle; the buddy is already playing %s' % cur)
        elif cur == self.shown or cur.startswith('claude__'):
            r = self.board.play(target)
            if r == 'missing' and target != 'cycle':
                r = self.board.play('cycle')
            log('Claude is idle; the buddy goes back to %s (%s)' % (target, r))
            self.history.append((time.strftime('%H:%M:%S'), 'idle', target))
        else:
            log('Claude is idle; someone picked %s on the buddy meanwhile, leaving it' % cur)
        self.active, self.shown, self.shown_act = False, None, None
        write_state(None)
        return True

    def tick(self):
        now = self.clock()
        with self.lock:
            act, urgent = self.desired(now)
            if act != self.want:
                self.want, self.want_since = act, now
            while self.flashes and now - self.flashes[0][1] > 20:
                self.flashes.popleft()                       # stale: the buddy was busy or away
            if urgent:
                self.flashes.clear()
            flash = None
            if self.flashes and now >= self.hold_until and not urgent:
                flash = self.flashes.popleft()[0]
            held_for = now - self.want_since
        if (act or flash) and self._board_ok(now) and now - self.names_at > 300:
            self.refresh_names(now)
        if flash:
            name = self.resolve(flash)
            if name and self._show(name, flash, now):
                self.hold_until = now + FLASH_SECONDS.get(flash, 5.0)
                return
        if now < self.hold_until and not urgent:
            return
        if act is None:
            if self.active:
                self.restore(now)
            return
        name = self.resolve(act, held_for)
        if name and name != self.shown and self._show(name, act, now):
            # no hold after "needs you": once the user answers, the face follows at once
            self.hold_until = now if urgent else now + self.cfg['min_seconds']

    def snapshot(self):
        now = self.clock()
        with self.lock:
            return {
                'host': self.cfg['host'], 'active': self.active, 'previous': self.prev,
                'showing': self.shown, 'activity': self.shown_act, 'wanted': self.want,
                'board_error': self.last_error,
                'sessions': [{'id': s.sid[:8], 'cwd': s.cwd, 'activity': s.act,
                              'waiting_for_user': s.attention is not None, 'subagents': s.agents,
                              'last_event_s': round(now - s.seen, 1)} for s in self.sessions.values()],
                'recent': list(self.history),
            }


def write_state(state):
    try:
        if state is None:
            os.remove(STATE_FILE)
        else:
            os.makedirs(CONF_DIR, exist_ok=True)
            with open(STATE_FILE, 'w') as f:
                json.dump(state, f)
    except OSError:
        pass


def read_state():
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


# ---------------------------------------------------------------------------- daemon process

def daemon_main():
    cfg = load_config()
    ctl = Controller(cfg, Board(cfg['host']))
    st = read_state()
    if st:                                   # a previous daemon changed the buddy and did not put it back
        ctl.active, ctl.prev = True, st.get('prev') or 'cycle'
    stop = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def _reply(self, code, body=None):
            data = json.dumps(body).encode() if body is not None else b''
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path == '/status' and self.headers.get(HEADER):
                return self._reply(200, ctl.snapshot())
            self._reply(404)

        def do_POST(self):
            if not self.headers.get(HEADER):
                return self._reply(403)
            n = min(int(self.headers.get('Content-Length') or 0), 65536)
            body = self.rfile.read(n) if n else b''
            if self.path == '/event':
                try:
                    ctl.apply(json.loads(body.decode() or '{}'))
                except ValueError:
                    return self._reply(400)
                return self._reply(204)
            if self.path == '/stop':
                stop.set()
                return self._reply(200, {'ok': True})
            self._reply(404)

        def log_message(self, *args):
            pass

    class Server(ThreadingHTTPServer):
        request_queue_size = 128             # several sessions can fire hooks at the same moment (default 5)

    try:
        server = Server(('127.0.0.1', int(cfg['port'])), Handler)
    except OSError:
        return 0                             # another daemon has the port
    server.daemon_threads = True
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        if os.path.getsize(LOG_FILE) > 512 * 1024:
            os.replace(LOG_FILE, LOG_FILE + '.1')
    except OSError:
        pass
    log('daemon started (pid %d), buddy at %s' % (os.getpid(), cfg['host']))
    while not stop.is_set():
        try:
            ctl.tick()
        except Exception as e:               # never die on a bad tick; log it and carry on
            log('tick error: %r' % e)
        with ctl.lock:
            busy = any(s.act or s.attention is not None for s in ctl.sessions.values())
            quiet = not ctl.active and not busy and ctl.clock() - ctl.last_event > 1800
        if quiet:
            break
        stop.wait(0.2)
    if ctl.active:
        ctl.board_retry = 0
        ctl.restore(ctl.clock())
    server.shutdown()
    log('daemon stopped')
    return 0


def daemon_request(cfg, method, path, body=None, timeout=0.5):
    conn = http.client.HTTPConnection('127.0.0.1', int(cfg['port']), timeout=timeout)
    try:
        conn.request(method, path, body=body, headers={HEADER: '1', 'Content-Type': 'application/json'})
        r = conn.getresponse()
        data = r.read()
        return r.status, (json.loads(data.decode()) if data else None)
    finally:
        conn.close()


def spawn_daemon():
    subprocess.Popen([sys.executable, SCRIPT, 'daemon'], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                     stderr=subprocess.DEVNULL, close_fds=True, start_new_session=True, cwd=HERE)


# ---------------------------------------------------------------------------- commands

def cmd_hook(_args):
    """Run by Claude Code for each hook event. Prints nothing and always exits 0."""
    raw = sys.stdin.buffer.read()
    try:
        cfg = load_config()
        if not cfg.get('enabled', True) or os.environ.get('DESK_BUDDY') == '0':
            return 0
        msg = classify(json.loads(raw.decode('utf-8', 'replace') or '{}'))
        if msg is None:
            return 0
        body = json.dumps(msg).encode()
        try:
            daemon_request(cfg, 'POST', '/event', body)
            return 0
        except ConnectionRefusedError:
            pass                             # no daemon yet: start one below
        except OSError:
            try:                             # a daemon is there but slow: one more try, no second daemon
                daemon_request(cfg, 'POST', '/event', body, timeout=1.5)
            except OSError as e:
                log('hook: daemon did not take the event (%r)' % e)
            return 0
        spawn_daemon()
        for _ in range(20):                  # the daemon is usually listening within 0.1 s
            time.sleep(0.05)
            try:
                daemon_request(cfg, 'POST', '/event', body)
                return 0
            except OSError:
                continue
    except Exception as e:
        log('hook error: %r' % e)
    return 0


def hook_command():
    return 'python3 "%s" hook' % SCRIPT


def _read_settings(path):
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def _write_settings(path, settings):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + '.desk-buddy.tmp'
    with open(tmp, 'w') as f:
        json.dump(settings, f, indent=2, ensure_ascii=False)
        f.write('\n')
    os.replace(tmp, path)


def _remove_ours(hooks):
    """Drop our entries from a settings 'hooks' dict; returns how many were removed."""
    removed = 0
    for ev in list(hooks):
        groups = hooks[ev]
        if not isinstance(groups, list):
            continue
        keep = []
        for g in groups:
            inner = g.get('hooks', []) if isinstance(g, dict) else []
            mine = [h for h in inner if HOOK_MARK in str(h.get('command', ''))]
            if not mine:
                keep.append(g)
                continue
            removed += len(mine)
            rest = [h for h in inner if h not in mine]
            if rest:
                g = dict(g, hooks=rest)
                keep.append(g)
        if keep:
            hooks[ev] = keep
        else:
            del hooks[ev]
    return removed


def cmd_install(args):
    cfg = load_config()
    if args.host:
        cfg['host'] = args.host
    cfg['enabled'] = True
    save_config(cfg)
    print('config: %s (buddy at %s)' % (CONF_FILE, cfg['host']))

    path = args.settings or SETTINGS_FILE
    settings = _read_settings(path)
    backup = ''
    if os.path.exists(path):
        with open(path) as src, open(path + '.desk-buddy.bak', 'w') as dst:
            dst.write(src.read())
        backup = ' (backup: %s.desk-buddy.bak)' % path
    hooks = settings.setdefault('hooks', {})
    _remove_ours(hooks)
    for ev in HOOK_EVENTS:
        hooks.setdefault(ev, []).append({'hooks': [{'type': 'command', 'command': hook_command(), 'timeout': 10}]})
    _write_settings(path, settings)
    print('hooks:  %d events in %s%s' % (len(HOOK_EVENTS), path, backup))
    print('        running Claude Code sessions pick them up right away (restart one that stays quiet)')
    _report_board(cfg)
    return 0


def cmd_uninstall(args):
    path = args.settings or SETTINGS_FILE
    settings = _read_settings(path)
    n = _remove_ours(settings.get('hooks', {}))
    if 'hooks' in settings and not settings['hooks']:
        del settings['hooks']
    if n:
        _write_settings(path, settings)
    print('removed %d hook entries from %s' % (n, path))
    cfg = load_config()
    try:
        daemon_request(cfg, 'POST', '/stop', b'{}', timeout=3)
        print('daemon stopped')
    except OSError:
        pass
    return 0


def _report_board(cfg):
    st = Board(cfg['host']).status()
    if st is None:
        print('buddy:  no answer from http://%s/ (on the same network? try the IP address)' % cfg['host'])
        return
    names = anim_names(st)
    print('buddy:  http://%s/ is playing %s, %d animations stored' % (cfg['host'], st.get('current'), len(names)))
    ctl = Controller(cfg, None)
    ctl.names = names
    first = lambda act: (ctl.candidates(act) or ['-'])[0]
    missing = sorted({first(a) for a in ACTIVITIES if a not in OPTIONAL and first(a) not in names})
    print()
    print('  %-11s %-24s %s' % ('activity', 'plays', ''))
    for act in ACTIVITIES:
        if act in OPTIONAL:
            continue
        got = ctl.resolve(act)
        note = '' if got == first(act) else ('(stand-in for %s)' % first(act) if got else '(nothing on the buddy)')
        print('  %-11s %-24s %s' % (act, got or '-', note))
    langs = sorted(OPTIONAL)
    have = [l for l in langs if first(l) in names]
    print('  %-11s %s' % ('languages', ', '.join(have) if have else
                          'none on the buddy, edits show as editing (optional: %s)' % ', '.join(langs)))
    if missing:
        print()
        print('%d of the claude theme animations are not on the buddy; push them with:' % len(missing))
        print("  sim/test/push_all.sh %s '^Claude'" % cfg['host'])


def cmd_status(_args):
    cfg = load_config()
    path = SETTINGS_FILE
    settings = _read_settings(path)
    events = [ev for ev, groups in (settings.get('hooks') or {}).items() if HOOK_MARK in json.dumps(groups)]
    print('hooks:  %s' % ('%d events in %s' % (len(events), path) if events else 'not installed (buddy_bridge.py install)'))
    print('config: %s%s' % (CONF_FILE, '' if cfg.get('enabled', True) else '  (paused: buddy_bridge.py resume)'))
    try:
        _, snap = daemon_request(cfg, 'GET', '/status', timeout=1)
        if snap['active'] and snap['showing']:
            print('daemon: running; showing %s (%s)' % (snap['showing'], snap['activity']))
        else:
            print('daemon: running; %s' % ('about to show %s' % snap['wanted'] if snap['wanted'] else 'idle, the buddy is left alone'))
        for s in snap['sessions']:
            what = 'waiting for you' if s['waiting_for_user'] else (s['activity'] or 'idle')
            print('        session %s  %-16s %s  (%ss ago)' % (s['id'], what, s['cwd'], s['last_event_s']))
        for t, act, name in snap['recent'][-8:]:
            print('        %s %-10s %s' % (t, act, name))
        if snap['board_error']:
            print('        the buddy did not answer (%s)' % snap['board_error'])
    except OSError:
        print('daemon: not running (starts with the next Claude Code event)')
    _report_board(cfg)
    return 0


def cmd_demo(args):
    cfg = load_config()
    board = Board(cfg['host'])
    st = board.status()
    if st is None:
        print('no answer from http://%s/' % cfg['host'])
        return 1
    try:
        daemon_request(cfg, 'POST', '/stop', b'{}', timeout=3)
        time.sleep(0.5)
        st = board.status() or st
    except OSError:
        pass
    ctl = Controller(cfg, board)
    ctl.names = anim_names(st)
    prev = st.get('current') or 'cycle'
    if prev.startswith('claude__'):
        prev = 'cycle'
    acts = args.only.split(',') if args.only else list(ACTIVITIES)
    try:
        for act in acts:
            name = ctl.resolve(act)
            if not name:
                print('%-11s (nothing on the buddy)' % act)
                continue
            print('%-11s %s' % (act, name), flush=True)
            board.play(name)
            time.sleep(args.seconds)
    except KeyboardInterrupt:
        pass
    finally:
        board.play(prev)
        print('back to %s' % prev)
    return 0


def cmd_pause(_args, enabled=False):
    cfg = load_config()
    cfg['enabled'] = enabled
    save_config(cfg)
    if not enabled:
        try:
            daemon_request(cfg, 'POST', '/stop', b'{}', timeout=3)
        except OSError:
            pass
    print('Claude Code activity %s on the buddy' % ('shows' if enabled else 'no longer shows'))
    return 0


def cmd_stop(_args):
    try:
        daemon_request(load_config(), 'POST', '/stop', b'{}', timeout=3)
        print('daemon stopping (the buddy goes back to what it was playing)')
    except OSError:
        print('daemon not running')
    return 0


def main(argv=None):
    p = argparse.ArgumentParser(description='Show Claude Code activity on the desk buddy.')
    sub = p.add_subparsers(dest='cmd')
    sub.add_parser('hook', help='run by Claude Code hooks (reads the event on stdin)')
    sub.add_parser('daemon', help='the background process (started by the hook)')
    i = sub.add_parser('install', help='add the hooks to ~/.claude/settings.json')
    i.add_argument('--host', help='the buddy address, e.g. 192.168.50.99 or desk-buddy.local')
    i.add_argument('--settings', help='settings file (default ~/.claude/settings.json; or a project .claude/settings.json)')
    u = sub.add_parser('uninstall', help='remove the hooks')
    u.add_argument('--settings')
    sub.add_parser('status', help='hooks, daemon, buddy and the animation for each activity')
    d = sub.add_parser('demo', help='play each activity on the buddy')
    d.add_argument('--seconds', type=float, default=5.0)
    d.add_argument('--only', help='comma-separated activities')
    sub.add_parser('pause', help='stop showing Claude activity')
    sub.add_parser('resume', help='show Claude activity again')
    sub.add_parser('stop', help='stop the daemon')
    args = p.parse_args(argv)
    if args.cmd == 'hook':
        return cmd_hook(args)
    if args.cmd == 'daemon':
        return daemon_main()
    if args.cmd == 'install':
        return cmd_install(args)
    if args.cmd == 'uninstall':
        return cmd_uninstall(args)
    if args.cmd == 'status':
        return cmd_status(args)
    if args.cmd == 'demo':
        return cmd_demo(args)
    if args.cmd == 'pause':
        return cmd_pause(args, False)
    if args.cmd == 'resume':
        return cmd_pause(args, True)
    if args.cmd == 'stop':
        return cmd_stop(args)
    p.print_help()
    return 0


if __name__ == '__main__':
    sys.exit(main())
