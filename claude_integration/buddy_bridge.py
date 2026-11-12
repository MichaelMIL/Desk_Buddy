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
  buddy_bridge.py pause | resume                 manual (Claude leaves the animation to you) / follow Claude
  buddy_bridge.py start | stop                   start the daemon now / stop it (puts the buddy back first)
  buddy_bridge.py uninstall                      remove the hooks

Python 3.8+, standard library only. See README.md next to this file.
"""
import argparse
import asyncio
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
PYTHON_FILE = os.path.join(CONF_DIR, 'claude-python')   # the daemon's interpreter (has bleak), for menubar/
# Animation files to put back on the buddy (kept by sim/serve.py: every push, and sim/test/library.sh)
LIBRARY_DIR = os.environ.get('DESK_BUDDY_LIBRARY') or os.path.join(CONF_DIR, 'library')
PLAYS_FILE = os.path.join(CONF_DIR, 'claude-plays.json')  # when each animation last played (what to delete first)
SETTINGS_FILE = os.path.join(os.path.expanduser('~'), '.claude', 'settings.json')
HOOK_MARK = 'buddy_bridge.py'            # how install/uninstall recognise our hook entries
HEADER = 'X-Desk-Buddy'                  # required on daemon requests (keeps web pages from posting to it)

DEFAULTS = {
    'host': 'desk-buddy.local',          # the buddy: IP address or mDNS name (Wi-Fi), or 'ble' / 'ble:<name>'
    'ble_linger_seconds': 20,            # Bluetooth: disconnect this long after Claude goes idle
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
    'auto_upload': 'all',                # an activity's animation missing on the buddy but in the library:
                                         # 'all' uploads it, 'core' all but the language/studio ones, 'off' never
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
# code in a language without its own animation
LANGS.update((ext, 'polyglot') for ext in (
    '.rb', '.php', '.swift', '.kt', '.kts', '.scala', '.cs', '.fs', '.dart', '.lua', '.pl', '.r', '.jl',
    '.ex', '.exs', '.erl', '.hs', '.ml', '.clj', '.elm', '.nim', '.zig', '.m', '.mm', '.vue', '.svelte',
    '.groovy', '.ps1', '.asm', '.s'))
for _lang in sorted(set(LANGS.values())):
    ACTIVITIES[_lang] = ['claude__' + _lang, 'claude__editing', 'claude__coding']
# 3D models and design files (sim/animations/theme_claude_studio.js); without them on the buddy, as above.
STUDIO = {ext: '3d_modeling' for ext in (
    '.scad', '.stl', '.3mf', '.obj', '.step', '.stp', '.blend', '.fcstd', '.gltf', '.glb', '.ply', '.dxf')}
STUDIO.update((ext, 'designing') for ext in (
    '.css', '.scss', '.sass', '.less', '.styl', '.pcss', '.svg', '.fig', '.sketch'))
ACTIVITIES['3d_modeling'] = ['claude__3d_modeling', 'claude__editing', 'claude__coding']
ACTIVITIES['designing'] = ['claude__designing', 'claude__editing', 'claude__writing']
FILE_KINDS = dict(LANGS, **STUDIO)
# not part of the core theme; `status` does not ask to push them
OPTIONAL = set(LANGS.values()) | set(STUDIO.values())
# The animations the bridge itself relies on (not the optional ones): a full buddy keeps them longest.
CORE_NAMES = {n for a, ns in ACTIVITIES.items() if a not in OPTIONAL for n in ns}
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
# renders, exports or slices a 3D model
MODEL_CMDS = {'openscad', 'blender', 'freecad', 'freecadcmd', 'prusa-slicer', 'prusaslicer', 'orca-slicer',
              'orcaslicer', 'meshlab', 'meshlabserver'}
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
    if first.lower() in MODEL_CMDS:
        return '3d_modeling', 'build'
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
        if ext in FILE_KINDS:
            return FILE_KINDS[ext]
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


# ---------------------------------------------------------------------------- the library

LIB_FILE_RE = re.compile(r'^([a-z0-9_]{1,31})\.(dbal|dbaz|dba)$')
SPACE_RE = re.compile(r'not enough space')
UPLOAD_REPLY_RE = re.compile(r'^(ready|ack|stored|error)\b ?(.*)$')
MAX_EVICTIONS = 12                       # deletions to make room for one upload
UPLOAD_RETRY_SECONDS = 600               # a failed upload is not tried again for this long


class Library:
    """Animation files the bridge can put back on the buddy after they were deleted from it:
    <name>.dbal (or .dbaz / .dba) in LIBRARY_DIR, the bytes the buddy stores."""

    def __init__(self, path):
        self.path = path

    def names(self):
        try:
            return {m.group(1) for m in map(LIB_FILE_RE.match, os.listdir(self.path)) if m}
        except OSError:
            return set()

    def data(self, name):
        for ext in ('.dbal', '.dbaz', '.dba'):
            try:
                with open(os.path.join(self.path, name + ext), 'rb') as f:
                    return f.read()
            except OSError:
                continue
        return None


class Recency:
    """When each animation last played on the buddy (shown by the bridge, picked in the menu bar
    app, or seen playing), kept in PLAYS_FILE. A full buddy deletes the least recently played first."""

    def __init__(self, path, clock=time.time):
        self.path, self.clock = path, clock
        try:
            with open(path) as f:
                self.at = {str(k): float(v) for k, v in json.load(f).items()}
        except (OSError, ValueError, AttributeError):
            self.at = {}

    def touch(self, name):
        if not name or name == 'cycle':
            return
        self.at[name] = self.clock()
        try:
            os.makedirs(os.path.dirname(self.path), exist_ok=True)
            tmp = self.path + '.tmp'
            with open(tmp, 'w') as f:
                json.dump(self.at, f)
            os.replace(tmp, self.path)
        except OSError:
            pass

    def get(self, name):
        return self.at.get(name, 0.0)


def theme_of(name):
    return name.split('__', 1)[0] if '__' in name[1:] else ''


# ---------------------------------------------------------------------------- the buddy

# Console commands the menu bar app may send through the daemon (POST /buddy); nothing that
# changes settings for good or reboots. Over Wi-Fi each maps onto an HTTP endpoint (no `next`).
BUDDY_COMMANDS = ('play', 'cycle', 'next', 'brightness', 'screen', 'theme')


class Board:
    """The buddy's HTTP API (hardware/src/net.cpp)."""
    commands = tuple(c for c in BUDDY_COMMANDS if c != 'next')

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

    def command(self, cmd):
        """One of `commands` as the console would take it ("brightness 60"), sent to the matching
        endpoint. Returns 'ok' or the buddy's error, or None if it does not answer."""
        verb, _, arg = cmd.partition(' ')
        arg = arg.strip()
        routes = {'play': ('/api/play', {'name': arg}), 'cycle': ('/api/play', {'name': 'cycle'}),
                  'brightness': ('/api/brightness', {'value': arg}),
                  'screen': ('/api/screen', {'on': '1' if arg in ('on', '1') else '0'}),
                  'theme': ('/api/theme', {'name': '' if arg == 'none' else arg})}
        if verb not in routes:
            return '%s: not available over Wi-Fi' % verb
        path, query = routes[verb]
        try:
            self._request('POST', path + '?' + urllib.parse.urlencode(query))
            return 'ok'
        except urllib.error.HTTPError as e:
            try:
                return json.loads(e.read().decode()).get('error') or 'error %d' % e.code
            except (OSError, ValueError, AttributeError):
                return 'error %d' % e.code
        except (OSError, ValueError, http.client.HTTPException):
            return None

    def upload(self, name, data):
        """Store an animation (PUT /api/anim). Returns ('ok', KB free), ('space', message) when it
        does not fit, ('error', message) or ('down', message)."""
        req = urllib.request.Request('http://%s/api/anim' % self.host, data=data, method='PUT',
                                     headers={'X-Anim-Name': name, 'Content-Type': 'application/octet-stream'})
        try:
            with urllib.request.urlopen(req, timeout=max(30.0, len(data) / 2000)) as r:
                return 'ok', json.loads(r.read().decode() or '{}').get('free_kb')
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read().decode()).get('error') or 'error %d' % e.code
            except (OSError, ValueError, AttributeError):
                msg = 'error %d' % e.code
            return ('space' if e.code == 507 or SPACE_RE.search(msg) else 'error'), msg
        except (OSError, ValueError, http.client.HTTPException) as e:
            return 'down', str(e)

    def delete(self, name):
        """'ok', 'missing' (not there, or built in) or 'down'."""
        try:
            self._request('DELETE', '/api/anim?name=' + urllib.parse.quote(name))
            return 'ok'
        except urllib.error.HTTPError as e:
            return 'missing' if e.code == 404 else 'down'
        except (OSError, ValueError, http.client.HTTPException):
            return 'down'

    def describe(self):
        return 'http://%s/' % self.host

    def connected(self):
        return None                           # HTTP: no lasting link

    def release(self):
        pass

    def close(self):
        pass


NUS_SERVICE = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
NUS_RX = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'
NUS_TX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'


class BleError(Exception):
    pass


class BleBoard:
    """The buddy over Bluetooth LE: its console commands (state, names, play) over the Nordic UART
    Service (hardware/BLE.md), with bleak. The buddy takes one connection at a time, so the link is
    held only while Claude is active and dropped `linger` seconds after release(); the phone app
    and the simulator's Bluetooth push can connect in between.

    bleak runs on an asyncio loop in its own thread; status() and play() may be called from any
    thread and are serialised on that loop. The first connection needs pairing: the buddy shows a
    6-digit code and macOS asks for it (after that the bond is reused silently)."""

    commands = BUDDY_COMMANDS

    def __init__(self, name='', timeout=8.0, linger=20.0, pair_timeout=60.0):
        self.name = name.strip()
        self.timeout, self.linger, self.pair_timeout = timeout, linger, pair_timeout
        self.client = None
        self.lines = None
        self.buf = ''
        self.fresh = False                    # connected, no reply yet (pairing may be pending)
        self.gen = 0                          # bumped by every command; a pending release checks it
        self.names, self.count = None, None   # `names` is fetched again only when `count` changes
        self.error = ''
        self.loop = asyncio.new_event_loop()
        self.lock = None
        threading.Thread(target=self._run_loop, daemon=True).start()

    def _run_loop(self):
        asyncio.set_event_loop(self.loop)
        self.lock = asyncio.Lock()
        self.loop.run_forever()

    def _call(self, coro, timeout):
        return asyncio.run_coroutine_threadsafe(coro, self.loop).result(timeout)

    def describe(self):
        return 'Bluetooth (%s)' % (self.name or 'any desk buddy')

    def connected(self):
        c = self.client
        try:
            return bool(c is not None and c.is_connected)
        except Exception:
            return False

    # -- inside the loop

    def _on_tx(self, _char, data):
        self.buf += bytes(data).decode('utf-8', 'replace')
        while '\n' in self.buf:
            line, self.buf = self.buf.split('\n', 1)
            line = line.strip()
            if line:
                self.lines.put_nowait(line)

    def _on_disconnect(self, _client):
        self.client = None

    async def _ensure(self):
        if self.client is not None and self.client.is_connected:
            return
        try:
            from bleak import BleakClient, BleakScanner
        except ImportError:
            raise BleError('Bluetooth needs bleak: %s -m pip install bleak' % sys.executable)

        def match(d, ad):
            if NUS_SERVICE not in [u.lower() for u in ad.service_uuids]:
                return False
            return not self.name or self.name in (ad.local_name, d.name)
        dev = await self._already_connected()
        if dev is None:
            dev = await BleakScanner.find_device_by_filter(match, timeout=10)
        if dev is None:
            raise BleError('no desk buddy advertising (out of range, or another phone or app is connected to it)')
        client = BleakClient(dev, disconnected_callback=self._on_disconnect, timeout=20)
        await client.connect()
        self.lines, self.buf = asyncio.Queue(), ''
        await client.start_notify(NUS_TX, self._on_tx)
        self.client, self.fresh = client, True

    async def _already_connected(self):
        """macOS: a buddy another app on this Mac is connected to (the remote page in Chrome, the
        phone app's macOS build). It does not advertise then, but CoreBluetooth shares the link."""
        if sys.platform != 'darwin':
            return None
        try:
            from CoreBluetooth import CBUUID
            from bleak.backends.corebluetooth.CentralManagerDelegate import CentralManagerDelegate
            from bleak.backends.device import BLEDevice
            mgr = CentralManagerDelegate()
            await mgr.wait_until_ready()
            found = mgr.central_manager.retrieveConnectedPeripheralsWithServices_([CBUUID.UUIDWithString_(NUS_SERVICE)])
            for p in list(found or []):
                if not self.name or p.name() == self.name:
                    return BLEDevice(p.identifier().UUIDString(), p.name(), (p, mgr))
        except Exception:                     # bleak internals differ: just scan
            pass
        return None

    async def _drop(self):
        c, self.client = self.client, None
        if c is not None:
            try:
                await c.disconnect()
            except Exception:
                pass

    async def _command(self, cmd, accept):
        """Send one console command; return the first reply line accept() takes."""
        self.gen += 1
        async with self.lock:
            try:
                await self._ensure()
                while not self.lines.empty():                  # leftovers from a command that timed out
                    self.lines.get_nowait()
                # first command on a new link: macOS may be showing the pairing prompt
                wait = self.pair_timeout if self.fresh else self.timeout
                await self.client.write_gatt_char(NUS_RX, (cmd + '\n').encode(), response=True)
                end = self.loop.time() + wait
                while True:
                    line = await asyncio.wait_for(self.lines.get(), max(0.05, end - self.loop.time()))
                    if accept(line):
                        self.fresh, self.error = False, ''
                        return line
            except Exception as e:
                self.error = str(e) or type(e).__name__
                await self._drop()                             # start clean next time
                raise

    async def _status(self):
        line = await self._command('state', lambda l: l.startswith('state '))
        st = json.loads(line[6:])
        if self.names is None or st.get('count') != self.count:
            got = await self._command('names', lambda l: l.startswith('names '))
            self.names, self.count = [n for n in got[6:].split(',') if n], st.get('count')
        st['animations'] = list(self.names)
        return st

    async def _reply(self, timeout):
        """The next ready / ack / stored / error line of an upload."""
        end = self.loop.time() + timeout
        while True:
            line = await asyncio.wait_for(self.lines.get(), max(0.05, end - self.loop.time()))
            m = UPLOAD_REPLY_RE.match(line)
            if m:
                return m.group(1), m.group(2)

    async def _upload(self, name, data):
        """The upload protocol (hardware/BLE.md): `upload <name> <bytes>`, then windows of raw bytes
        as writes without response, each acknowledged. It holds the lock throughout, so no command
        (and no release) can land in the middle of the data."""
        self.gen += 1                                          # cancels a pending release
        async with self.lock:
            try:
                await self._ensure()
                while not self.lines.empty():
                    self.lines.get_nowait()
                wait = self.pair_timeout if self.fresh else self.timeout
                await self.client.write_gatt_char(NUS_RX, ('upload %s %d\n' % (name, len(data))).encode(), response=True)
                kind, rest = await self._reply(wait)
                self.fresh = False
                if kind == 'error':
                    return ('space' if SPACE_RE.search(rest) else 'error'), rest
                if kind != 'ready':
                    return 'error', '%s %s' % (kind, rest)
                window, sent = int(rest.split()[0]), 0
                chunk = max(20, int(getattr(self.client, 'mtu_size', 23) or 23) - 3)
                while sent < len(data):
                    part = data[sent:sent + window]
                    for i in range(0, len(part), chunk):
                        await self.client.write_gatt_char(NUS_RX, part[i:i + chunk], response=False)
                    sent += len(part)
                    kind, rest = await self._reply(20)
                    if kind != 'ack':
                        return 'error', rest or 'upload failed'
                kind, rest = await self._reply(20)
                if kind != 'stored':
                    return 'error', rest or 'the buddy did not store it'
                self.names = None                              # fetch the list again
                m = re.search(r'(\d+) KB free', rest)
                return 'ok', int(m.group(1)) if m else None
            except Exception as e:
                self.error = str(e) or type(e).__name__
                await self._drop()                             # a broken upload ends with the link
                return 'down', self.error

    async def _release_later(self, gen):
        await asyncio.sleep(self.linger)
        if gen == self.gen:
            async with self.lock:
                if gen == self.gen:
                    await self._drop()

    # -- the Board interface

    def status(self):
        try:
            return self._call(self._status(), self.pair_timeout + 2 * self.timeout + 30)
        except Exception:
            return None

    def play(self, name):
        try:
            line = self._call(self._command('play ' + name, lambda l: l == 'ok' or l.startswith('no animation')),
                              self.pair_timeout + self.timeout + 30)
        except Exception:
            return 'down'
        return 'ok' if line == 'ok' else 'missing'

    def command(self, cmd):
        """Any console command; returns its reply line ("ok", "brightness 60%", ...) or None."""
        try:
            return self._call(self._command(cmd, lambda l: not l.startswith(('state ', 'names '))),
                              self.pair_timeout + self.timeout + 30)
        except Exception:
            return None

    def upload(self, name, data):
        """Store an animation over the link; see Board.upload for the result."""
        try:
            return self._call(self._upload(name, data), self.pair_timeout + 60 + len(data) / 1000)
        except Exception as e:
            return 'down', str(e) or type(e).__name__

    def delete(self, name):
        """'ok', 'missing' (not there, or built in) or 'down'."""
        try:
            line = self._call(self._command('delete ' + name, lambda l: l == 'deleted' or l.startswith(('not found', 'delete'))),
                              self.pair_timeout + self.timeout + 30)
        except Exception:
            return 'down'
        self.names = None
        return 'ok' if line == 'deleted' else 'missing'

    def release(self):
        """Disconnect after `linger` seconds unless another command comes first."""
        gen = self.gen
        asyncio.run_coroutine_threadsafe(self._release_later(gen), self.loop)

    async def _drop_locked(self):
        self.gen += 1                         # cancels a pending release
        async with self.lock:                 # after a command in flight
            await self._drop()

    def close(self):
        """Disconnect now (after a command in flight)."""
        try:
            self._call(self._drop_locked(), 30)
        except Exception:
            pass


def make_board_type(cfg):
    host = str(cfg.get('host') or '')
    return 'ble' if host == 'ble' or host.startswith('ble:') else 'http'


def make_board_desc(cfg):
    host = str(cfg.get('host') or '')
    return 'Bluetooth (%s)' % (host[4:] or 'any desk buddy') if make_board_type(cfg) == 'ble' else 'http://%s/' % host


def make_board(cfg):
    """host 'ble' or 'ble:<name>' = Bluetooth (as sim/test/push_all.sh), anything else = Wi-Fi (HTTP)."""
    host = str(cfg.get('host') or '')
    if make_board_type(cfg) == 'ble':
        return BleBoard(host[4:], linger=float(cfg.get('ble_linger_seconds', 20)))
    return Board(host)


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

    def __init__(self, cfg, board, clock=time.monotonic, library=None, recency=None):
        self.cfg, self.board, self.clock = cfg, board, clock
        self.library = library or Library(LIBRARY_DIR)
        self.recency = recency or Recency(PLAYS_FILE)
        self.upload_lock = threading.Lock()     # one upload at a time (the tick, the menu bar app)
        self.uploading = None                   # the animation being put on the buddy now
        self.upload_failed = {}                 # name -> when an upload last failed (retried later)
        self.undeletable = set()                # built in: the buddy refuses to delete them
        self.board_current, self.board_theme = None, ''
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
        self.board_backoff = 0.0
        self.last_error = ''
        self.last_event = clock()
        self.history = collections.deque(maxlen=20)
        self.away_until = 0.0                   # another program is using the buddy (POST /hold)
        self.paused = not cfg.get('enabled', True)   # manual: Claude Code leaves the buddy alone (pause)

    # -- events

    def apply(self, msg):
        now = self.clock()
        with self.lock:
            self.last_event = now
            if self.paused:                       # hooks check the config too; this covers one in flight
                return
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
        # 15 s, 30 s, then every 60 s: a Bluetooth scan alone takes up to 10 s
        self.board_backoff = min(60.0, self.board_backoff * 2) if self.board_backoff else 15.0
        self.board_retry = now + self.board_backoff
        if self.last_error != what:
            log('buddy over %s does not answer (%s%s); retrying, up to every 60 s'
                % (self.board.describe(), what, ': ' + self.board.error if getattr(self.board, 'error', '') else ''))
        self.last_error = what

    def _board_up(self):
        if self.last_error:
            log('buddy over %s answers again' % self.board.describe())
        self.last_error, self.board_backoff = '', 0.0

    def refresh_names(self, now, status=None):
        st = status or self.board.status()
        if st is None:
            self._board_down(now, 'status')
            return None
        self.names, self.names_at = anim_names(st), now
        self.board_current, self.board_theme = st.get('current'), st.get('theme') or ''
        self.recency.touch(self.board_current)
        self._board_up()
        return st

    # -- the library: put animations back on the buddy

    def upload_target(self, act):
        """The animation to upload for an activity: its best candidate when that is not on the
        buddy but in the library (None when the best one available is on the buddy already)."""
        mode = self.cfg.get('auto_upload', 'all')
        if mode in (False, None, 'off', 'none') or self.names is None or (mode == 'core' and act in OPTIONAL):
            return None
        lib = None
        for n in self.candidates(act):
            if n in self.names:
                return None
            lib = self.library.names() if lib is None else lib
            if n in lib:
                return n if self.clock() - self.upload_failed.get(n, -1e9) > UPLOAD_RETRY_SECONDS else None
        return None

    def _victim(self, keep):
        """What to delete to make room: an animation the library can put back, never the one being
        uploaded, what is showing, what the buddy goes back to, or a built-in one. First the ones
        nothing uses now: other themes' faces (they do not cycle) and the optional language and
        studio animations; then faces that cycle and the core Claude ones. Least recently played
        first within each."""
        lib = self.library.names()
        protect = {keep, self.shown, self.prev, self.board_current, 'cycle'} | self.undeletable
        if self.cfg.get('restore') not in (None, 'previous', 'cycle'):
            protect.add(self.cfg['restore'])
        cands = [n for n in (self.names or ()) if n in lib and n not in protect]
        if not cands:
            return None
        theme = self.board_theme

        def key(n):
            t = theme_of(n)
            return (t == '' or t == theme or n in CORE_NAMES, self.recency.get(n), n)
        return min(cands, key=key)

    def ensure(self, name, why):
        """Make sure `name` is on the buddy, uploading it from the library if needed and deleting
        the least recently played animations the library holds while the buddy says it is full.
        True when it is there. Blocks for the upload (Bluetooth: about 8 s for 20 KB)."""
        with self.upload_lock:
            now = self.clock()
            if self.names is None and self.refresh_names(now) is None:
                return False
            if name in self.names:
                return True
            data = self.library.data(name)
            if data is None:
                return False
            self.uploading = name
            try:
                for _ in range(MAX_EVICTIONS + 1):
                    if self.clock() < self.away_until:          # POST /hold: another program takes the buddy
                        log('%s: upload of %s stopped for a hold' % (why, name))
                        return False
                    r, info = self.board.upload(name, data)
                    if r == 'ok':
                        self.names.add(name)
                        self.upload_failed.pop(name, None)
                        log('%s: put %s back on the buddy from the library (%d KB%s)'
                            % (why, name, (len(data) + 1023) // 1024, ', %s KB free' % info if info is not None else ''))
                        return True
                    if r != 'space':
                        log('%s: could not upload %s: %s' % (why, name, info))
                        if r == 'down':
                            self._board_down(self.clock(), 'upload')
                        break
                    victim = self._victim(name)
                    if victim is None:
                        log('%s: no room for %s, and nothing on the buddy that the library could put back' % (why, name))
                        break
                    d = self.board.delete(victim)
                    if d == 'ok':
                        self.names.discard(victim)
                        log('deleted %s from the buddy to make room for %s (least recently played; the library has it)'
                            % (victim, name))
                    elif d == 'missing':
                        self.undeletable.add(victim)            # built in
                    else:
                        self._board_down(self.clock(), 'delete')
                        break
                self.upload_failed[name] = self.clock()
                return False
            finally:
                self.uploading = None

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
            self.recency.touch(name)
            self.shown, self.shown_act = name, act
            self._board_up()
            self.history.append((time.strftime('%H:%M:%S'), act, name))
            log('%-10s -> %s' % (act, name))
            self.board.release()                # Bluetooth: let go of the link if nothing follows
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
            if target != 'cycle' and self.names is not None and target not in self.names:
                self.ensure(target, 'idle')                 # deleted meanwhile: put it back if the library can
            r = self.board.play(target)
            if r == 'missing' and target != 'cycle':
                r = self.board.play('cycle')
            if r == 'ok':
                self.recency.touch(target)
            log('Claude is idle; the buddy goes back to %s (%s)' % (target, r))
            self.history.append((time.strftime('%H:%M:%S'), 'idle', target))
        else:
            log('Claude is idle; someone picked %s on the buddy meanwhile, leaving it' % cur)
        self.active, self.shown, self.shown_act = False, None, None
        write_state(None)
        self.board.release()                    # Bluetooth: free the link for the phone app
        return True

    def hold(self, seconds):
        """Stay off the buddy for `seconds` (0 = until now): another program on this computer is about
        to use it, e.g. an animation upload over Bluetooth, which a command in between would corrupt."""
        now = self.clock()
        with self.lock:
            self.away_until = now + max(0.0, float(seconds))
            self.shown = None                   # whatever it plays afterwards, show ours again
        if seconds > 0:
            self.board.close()                  # Bluetooth: disconnect now, so the other program can connect
            log('holding off the buddy for %d s' % seconds)
        else:
            log('hold released')

    def set_paused(self, paused):
        """Manual mode (buddy_bridge.py pause, the menu bar app's Manual): Claude Code stops changing
        the animation; the buddy goes back to what it played before Claude (tick), and from then on
        only the user picks. The daemon stays up so the menu bar app can still control the buddy."""
        with self.lock:
            self.paused = bool(paused)
            if self.paused:
                self.sessions.clear()
                self.flashes.clear()
                self.want, self.hold_until = None, 0.0
                self.board_retry = 0.0             # restore now, not after a backoff
        log('manual: Claude Code leaves the buddy alone' if paused else 'following Claude Code again')

    def buddy(self, cmd=None):
        """For the menu bar app (GET / POST /buddy): run one console command from BUDDY_COMMANDS on
        the buddy, over the daemon's own link, then read its state. Returns (http code, body).
        Picking a face here while Claude is busy lasts until the next activity."""
        now = self.clock()
        if now < self.away_until:
            return 409, {'ok': False, 'error': 'holding off the buddy for another %d s' % round(self.away_until - now)}
        with self.lock:
            self.last_event = now                   # the daemon stays up while the app uses it
        commands = list(getattr(self.board, 'commands', ()))
        reply, ok = None, True
        if cmd is not None:
            verb = cmd.split(' ', 1)[0]
            if verb not in commands:
                return 400, {'ok': False, 'error': '%s is not available over %s' % (verb, self.board.describe())}
            arg = cmd.split(' ', 1)[1].strip() if ' ' in cmd else ''
            if verb == 'play' and arg and arg != 'cycle':
                if self.names is None or arg not in self.names:
                    self.refresh_names(self.clock())
                if self.names is not None and arg not in self.names and arg in self.library.names() \
                        and not self.ensure(arg, 'menu bar'):
                    st = self.board.status()
                    if not self.active:
                        self.board.release()
                    return 200, {'ok': False, 'error': 'could not put %s on the buddy (see the log)' % arg,
                                 'buddy': self._with_library(st), 'commands': commands}
            reply = self.board.command(cmd)
            if reply is None:
                self.board.release()
                return 502, {'ok': False, 'error': 'no answer over %s' % self.board.describe()}
            ok = reply == 'ok' or reply.startswith(verb + ' ')     # "brightness 60%"
            if ok:
                log('menu bar: %s' % cmd)
                if verb == 'play':
                    self.recency.touch(arg)
        st = self.board.status()
        if not self.active:
            self.board.release()                    # Bluetooth: let go after the linger
        if st is None:
            return 502, {'ok': False, 'error': 'no answer over %s' % self.board.describe()}
        body = {'ok': ok, 'buddy': self._with_library(st), 'commands': commands}
        if reply is not None:
            body['reply'] = reply
        if not ok:
            body['error'] = reply
        return 200, body

    def _with_library(self, st):
        """The buddy's state for the menu bar app, plus what the library could put back on it."""
        if st is not None:
            st = dict(st, library=sorted(self.library.names()))
        return st

    def tick(self):
        now = self.clock()
        if now < self.away_until:
            return
        if self.paused:
            if self.active and self.restore(now):   # just paused: put back what played before Claude,
                self.board.close()                  # and free the Bluetooth link at once (not after the linger)
            return
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
            return
        # the activity's own animation is not on the buddy but in the library: upload it now that
        # the stand-in is showing (never for "needs you"); the next tick shows it
        if not urgent and self._board_ok(now):
            target = self.upload_target(act)
            if target and (self.active or self._activate(now)):
                self.ensure(target, act)

    def snapshot(self):
        now = self.clock()
        connected = getattr(self.board, 'connected', None)
        with self.lock:
            return {
                'host': self.cfg['host'], 'active': self.active, 'previous': self.prev,
                'showing': self.shown, 'activity': self.shown_act, 'wanted': self.want,
                'board_error': self.last_error,
                # for the menu bar app (menubar/): the link, whether it is up (None: HTTP has none),
                # seconds left of a POST /hold, the daemon's pid
                'link': self.board.describe(), 'connected': connected() if connected else None,
                'hold_s': max(0, round(self.away_until - now)), 'pid': os.getpid(), 'python': sys.executable,
                'paused': self.paused, 'uploading': self.uploading,
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
    ctl = Controller(cfg, make_board(cfg))
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
            if self.path == '/board' and self.headers.get(HEADER):
                st = ctl.board.status()          # through the daemon's own link (Bluetooth: one at a time)
                if not ctl.active:
                    ctl.board.release()
                return self._reply(200, st)
            if self.path == '/buddy' and self.headers.get(HEADER):
                return self._reply(*ctl.buddy())
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
            if self.path == '/hold':
                try:
                    ctl.hold(float(json.loads(body.decode() or '{}').get('seconds', 120)))
                except (ValueError, TypeError, AttributeError):
                    return self._reply(400)
                return self._reply(200, {'ok': True})
            if self.path == '/stop':
                stop.set()
                return self._reply(200, {'ok': True})
            if self.path == '/pause':
                try:
                    ctl.set_paused(bool(json.loads(body.decode() or '{}').get('paused', True)))
                except (ValueError, AttributeError):
                    return self._reply(400)
                return self._reply(200, {'ok': True, 'paused': ctl.paused})
            if self.path == '/buddy':
                try:
                    cmd = str(json.loads(body.decode() or '{}')['command']).strip()
                except (ValueError, KeyError, TypeError, AttributeError):
                    return self._reply(400, {'ok': False, 'error': 'body: {"command": "brightness 60"}'})
                return self._reply(*ctl.buddy(cmd))
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
    try:                                     # the menu bar app starts the daemon with this Python (bleak)
        with open(PYTHON_FILE, 'w') as f:
            f.write(sys.executable + '\n')
    except OSError:
        pass
    try:
        if os.path.getsize(LOG_FILE) > 512 * 1024:
            os.replace(LOG_FILE, LOG_FILE + '.1')
    except OSError:
        pass
    log('daemon started (pid %d), buddy over %s' % (os.getpid(), ctl.board.describe()))
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
    ctl.board.close()
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
                return 0
            except ConnectionRefusedError:
                pass                         # it was just shutting down: start a new one below
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
    ble = make_board_type(cfg) == 'ble'
    print('config: %s (buddy over %s)' % (CONF_FILE, 'Bluetooth' if ble else 'Wi-Fi at ' + cfg['host']))
    if ble:
        import importlib.util
        if importlib.util.find_spec('bleak') is None:
            print('Bluetooth needs bleak in the Python that runs the hooks: %s -m pip install bleak' % sys.executable)
            return 1
    try:                                     # a running daemon still has the old address
        daemon_request(cfg, 'POST', '/stop', b'{}', timeout=3)
        time.sleep(1)
    except OSError:
        pass

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


def _board_status(cfg):
    """(status or None, description). Asks the running daemon first: over Bluetooth it holds the link."""
    try:
        code, st = daemon_request(cfg, 'GET', '/board', timeout=90)
        if code == 200:
            return st, make_board_desc(cfg)
    except OSError:
        pass
    board = make_board(cfg)
    if isinstance(board, BleBoard):
        print('buddy:  connecting over Bluetooth... the first time, macOS asks for the 6-digit code on the buddy\'s screen',
              flush=True)
    try:
        return board.status(), board.describe() + (' (%s)' % board.error if getattr(board, 'error', '') else '')
    finally:
        board.close()


def _report_board(cfg):
    st, desc = _board_status(cfg)
    if st is None:
        hint = ('in range? another phone or app connected? paired?' if make_board_type(cfg) == 'ble'
                else 'on the same network? try the IP address')
        print('buddy:  no answer over %s (%s)' % (desc, hint))
        return
    names = anim_names(st)
    print('buddy:  %s is playing %s, %d animations stored' % (desc, st.get('current'), len(names)))
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
    for label, group in (('languages', LANGS), ('studio', STUDIO)):
        acts = sorted(set(group.values()))
        have = [a for a in acts if first(a) in names]
        print('  %-11s %s' % (label, ', '.join(have) if have else
                              'none on the buddy, edits show as editing (optional: %s)' % ', '.join(acts)))
    if missing:
        print()
        print('%d of the claude theme animations are not on the buddy; push them with:' % len(missing))
        print("  sim/test/push_all.sh %s '^Claude'" % ('ble' if make_board_type(cfg) == 'ble' else cfg['host']))


def cmd_status(_args):
    cfg = load_config()
    path = SETTINGS_FILE
    settings = _read_settings(path)
    events = [ev for ev, groups in (settings.get('hooks') or {}).items() if HOOK_MARK in json.dumps(groups)]
    print('hooks:  %s' % ('%d events in %s' % (len(events), path) if events else 'not installed (buddy_bridge.py install)'))
    print('config: %s%s' % (CONF_FILE, '' if cfg.get('enabled', True) else '  (manual, Claude Code leaves the buddy alone: buddy_bridge.py resume)'))
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
    try:                                     # the daemon would fight over the buddy (and hold the Bluetooth link)
        daemon_request(cfg, 'POST', '/stop', b'{}', timeout=3)
        time.sleep(1)
    except OSError:
        pass
    board = make_board(cfg)
    st = board.status()
    if st is None:
        print('no answer over %s' % board.describe())
        board.close()
        return 1
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
        board.close()
        print('back to %s' % prev)
    return 0


def cmd_pause(_args, enabled=False):
    """pause = manual: the hooks do nothing, and a running daemon puts the buddy back to what it played
    before Claude, then leaves it to the user (it stays up for the menu bar app's controls, and frees
    the Bluetooth link after the linger). resume = follow Claude Code again."""
    cfg = load_config()
    cfg['enabled'] = enabled
    save_config(cfg)
    try:
        code, _ = daemon_request(cfg, 'POST', '/pause', json.dumps({'paused': not enabled}).encode(), timeout=3)
        if code == 404 and not enabled:              # a daemon from before /pause: stop it instead
            daemon_request(cfg, 'POST', '/stop', b'{}', timeout=3)
    except OSError:
        pass
    print('Following Claude Code: its activity shows on the buddy' if enabled
          else 'Manual: Claude Code no longer changes the buddy; pick its animations yourself')
    return 0


def cmd_hold(args):
    try:
        daemon_request(load_config(), 'POST', '/hold', json.dumps({'seconds': args.seconds}).encode(), timeout=15)
        print('the bridge leaves the buddy alone for %d s' % args.seconds if args.seconds else 'the bridge is back')
    except OSError:
        print('daemon not running (nothing to hold)')
    return 0


def cmd_start(_args):
    """Start the daemon now instead of on the next hook event (the menu bar app's buddy controls)."""
    cfg = load_config()
    for i in range(40):
        try:
            daemon_request(cfg, 'GET', '/status', timeout=0.5)
            print('daemon running' if i else 'daemon already running')
            return 0
        except OSError:
            pass
        if i == 0:
            spawn_daemon()
        time.sleep(0.1)
    print('the daemon did not start (see %s)' % LOG_FILE)
    return 1


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
    sub.add_parser('pause', help='manual: Claude Code stops changing the animation (the buddy goes back first)')
    sub.add_parser('resume', help='follow Claude Code again')
    h = sub.add_parser('hold', help='leave the buddy alone for a while (frees the Bluetooth link at once)')
    h.add_argument('seconds', type=float, nargs='?', default=120, help='0 ends the hold')
    sub.add_parser('start', help='start the daemon now (it also starts with the next Claude Code event)')
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
    if args.cmd == 'hold':
        return cmd_hold(args)
    if args.cmd == 'start':
        return cmd_start(args)
    if args.cmd == 'stop':
        return cmd_stop(args)
    p.print_help()
    return 0


if __name__ == '__main__':
    sys.exit(main())
