#!/usr/bin/env python3
"""Tests for buddy_bridge.py:  python3 claude_integration/test_bridge.py

Hook payload shapes are the ones Claude Code 2.1.322 sends (captured with a
logging hook). The last test runs the real `hook` command and daemon against a
fake buddy on 127.0.0.1."""
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import buddy_bridge as bb  # noqa: E402

CLAUDE = ['claude__' + n for n in (
    'thinking writing hello spark pondering coding tests_pass debugging ship_it reading searching editing '
    'todo_list permission build_failed merge_conflict code_review ci_pipeline subagents compacting '
    'rubber_duck infinite_loop git_graph plan_mode done').split()]


def ev(name, **kw):
    d = {'session_id': kw.pop('sid', 's1'), 'transcript_path': '/t', 'cwd': '/w', 'hook_event_name': name,
         'permission_mode': kw.pop('mode', 'default')}
    d.update(kw)
    return d


def pre(tool, sid='s1', tid='t1', **tin):
    return ev('PreToolUse', sid=sid, tool_name=tool, tool_input=tin, tool_use_id=tid)


def post(tool, sid='s1', tid='t1', stdout='', **tin):
    return ev('PostToolUse', sid=sid, tool_name=tool, tool_input=tin, tool_use_id=tid,
              tool_response={'stdout': stdout, 'stderr': '', 'interrupted': False})


def fail(tool, error, sid='s1', tid='t1', interrupt=False, **tin):
    return ev('PostToolUseFailure', sid=sid, tool_name=tool, tool_input=tin, tool_use_id=tid,
              error=error, is_interrupt=interrupt, duration_ms=10)


class Classify(unittest.TestCase):
    def act(self, e):
        m = bb.classify(e)
        return m and m.get('act')

    def test_tools(self):
        self.assertEqual(self.act(pre('Read', file_path='/a.py')), 'reading')
        self.assertEqual(self.act(pre('Grep', pattern='x')), 'searching')
        self.assertEqual(self.act(pre('Glob', pattern='*')), 'searching')
        self.assertEqual(self.act(pre('Edit', file_path='/a.yaml')), 'editing')
        self.assertEqual(self.act(pre('Write', file_path='/a.yaml')), 'coding')
        self.assertEqual(self.act(pre('Write', file_path='/README.md')), 'writing')
        self.assertEqual(self.act(pre('Edit', file_path='/src/main.cpp')), 'cpp')
        self.assertEqual(self.act(pre('Write', file_path='/x/App.TSX')), 'typescript')
        self.assertEqual(self.act(pre('NotebookEdit', notebook_path='/n.ipynb')), 'python')
        self.assertEqual(self.act(pre('Edit', file_path='/app/Main.kt')), 'polyglot')
        self.assertEqual(self.act(pre('Agent', prompt='x')), 'subagents')
        self.assertEqual(self.act(pre('TodoWrite')), 'todo')
        self.assertEqual(self.act(pre('AskUserQuestion')), 'attention')
        self.assertEqual(self.act(pre('Skill')), 'thinking')
        self.assertEqual(self.act(pre('Skill', mode='plan') | {'permission_mode': 'plan'}), 'planning')
        self.assertEqual(self.act(pre('mcp__notion__notion-search')), 'searching')

    def test_bash(self):
        b = bb.bash_activity
        self.assertEqual(b('ls -la'), ('searching', 'query'))
        self.assertEqual(b('cd sim && grep -rn foo .'), ('searching', 'query'))
        self.assertEqual(b('head -50 x.c'), ('reading', 'query'))
        self.assertEqual(b('git add -A && git commit -m x && git push'), ('shipping', 'push'))
        self.assertEqual(b('git commit -m "make pytest faster"'), ('git', None))
        self.assertEqual(b('git -C hardware status'), ('git', 'query'))
        self.assertEqual(b('git diff HEAD~1'), ('reviewing', 'query'))
        self.assertEqual(b('git rebase main'), ('git', 'merge'))
        self.assertEqual(b('python3 -m pytest -q'), ('testing', 'test'))
        self.assertEqual(b('sim/test/run_tests.sh'), ('testing', 'test'))
        self.assertEqual(b('npm run test -- --watch=false'), ('testing', 'test'))
        self.assertEqual(b('cd hardware && pio run -t upload'), ('running', 'build'))
        self.assertEqual(b('FOO=1 timeout 30 make'), ('running', 'build'))
        self.assertEqual(b('gh pr checks 12'), ('ci', 'query'))
        self.assertEqual(b('gh pr create --fill'), ('shipping', 'push'))
        self.assertEqual(b('python3 tool.py'), ('running', None))

    def test_outcomes(self):
        m = bb.classify(post('Bash', command='pytest', stdout='5 passed'))
        self.assertEqual((m.get('flash'), m.get('act')), ('passed', None))
        m = bb.classify(post('Bash', command='pytest 2>&1 | tail', stdout='== 2 failed, 3 passed =='))
        self.assertEqual((m.get('flash'), m.get('act')), ('failed', 'debugging'))
        m = bb.classify(fail('Bash', 'Exit code 1\nFAILED test_x', command='npm test'))
        self.assertEqual((m.get('flash'), m.get('act')), ('failed', 'debugging'))
        m = bb.classify(fail('Bash', 'Exit code 1\nCONFLICT (content): x', command='git merge dev'))
        self.assertEqual(m.get('flash'), 'conflict')
        m = bb.classify(fail('Bash', 'Exit code 1', command='grep nothing file'))
        self.assertEqual((m.get('flash'), m.get('act')), (None, None))       # no match is not an error
        m = bb.classify(fail('Bash', 'Exit code 2', command='python3 x.py'))
        self.assertEqual(m.get('act'), 'debugging')
        m = bb.classify(fail('Bash', 'Interrupted', interrupt=True, command='sleep 100'))
        self.assertTrue(m.get('interrupt'))

    def test_events(self):
        self.assertEqual(bb.classify(ev('SessionStart', source='startup')).get('flash'), 'hello')
        self.assertIsNone(bb.classify(ev('SessionStart', source='compact')).get('flash'))
        self.assertEqual(self.act(ev('UserPromptSubmit', prompt='fix it')), 'thinking')
        self.assertEqual(self.act(ev('UserPromptSubmit', prompt='/review 12')), 'reviewing')
        self.assertEqual(self.act(ev('UserPromptSubmit', prompt='plan it', mode='plan')), 'planning')
        self.assertEqual(self.act(ev('PermissionRequest', tool_name='Bash')), 'attention')
        self.assertEqual(self.act(ev('Notification', notification_type='permission_prompt', message='x')), 'attention')
        self.assertIsNone(bb.classify(ev('Notification', notification_type='idle_prompt', message='x')))
        self.assertEqual(self.act(ev('Stop', stop_hook_active=False)), 'done')
        self.assertEqual(self.act(ev('PreCompact', trigger='auto')), 'compacting')
        self.assertIsNone(bb.classify(ev('PostToolBatch')))
        self.assertEqual(bb.classify(pre('Bash', command='make'))['bash_limit'], 120.0)
        self.assertNotIn('bash_limit', bb.classify(pre('Bash', command='make', run_in_background=True)))


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


class FakeBoard:
    def __init__(self, names, current='cycle'):
        self.names, self.current, self.plays, self.up = set(names), current, [], True
        self.releases = 0

    def describe(self):
        return 'fake'

    def release(self):
        self.releases += 1

    def close(self):
        pass

    def status(self):
        return {'current': self.current, 'animations': sorted(self.names)} if self.up else None

    def play(self, name):
        if not self.up:
            return 'down'
        if name != 'cycle' and name not in self.names:
            return 'missing'
        self.current = name
        self.plays.append(name)
        return 'ok'


class Display(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.TemporaryDirectory()
        bb.STATE_FILE = os.path.join(self.home.name, 'state.json')
        bb.LOG_FILE = os.path.join(self.home.name, 'log')
        self.clock = Clock()
        self.board = FakeBoard(CLAUDE + ['face_happy'], current='cycle')
        self.ctl = bb.Controller(dict(bb.DEFAULTS), self.board, self.clock)

    def tearDown(self):
        self.home.cleanup()

    def send(self, e):
        m = bb.classify(e)
        if m:
            self.ctl.apply(m)

    def run_for(self, seconds, step=0.25):
        end = self.clock.t + seconds
        while self.clock.t < end:
            self.ctl.tick()
            self.clock.t += step

    def test_a_turn(self):
        self.send(ev('SessionStart', source='startup'))
        self.run_for(1)
        self.assertEqual(self.board.plays, ['claude__hello'])
        self.send(ev('UserPromptSubmit', prompt='add a test'))
        self.run_for(4)                                          # hello holds ~4 s, then thinking
        self.assertEqual(self.board.current, 'claude__pondering')
        self.send(pre('Read', file_path='/a.py'))
        self.send(post('Read', file_path='/a.py'))
        self.run_for(3.5)
        self.assertEqual(self.board.current, 'claude__reading')
        self.send(pre('Edit', tid='t2', file_path='/a.py'))
        self.send(post('Edit', tid='t2', file_path='/a.py'))
        self.run_for(3.5)
        self.assertEqual(self.board.current, 'claude__editing')
        self.send(pre('Bash', tid='t3', command='pytest'))
        self.run_for(3.5)
        self.assertEqual(self.board.current, 'claude__ci_pipeline')
        self.send(post('Bash', tid='t3', command='pytest', stdout='3 passed'))
        self.run_for(1)
        self.assertEqual(self.board.current, 'claude__tests_pass')
        self.send(ev('Stop'))
        self.run_for(6)
        self.assertEqual(self.board.current, 'claude__done')
        self.run_for(60)
        self.assertEqual(self.board.current, 'cycle')          # put back to what it was doing
        self.assertFalse(self.ctl.active)
        self.assertEqual(self.board.plays[-1], 'cycle')
        self.assertEqual(self.board.releases, len(self.board.plays))   # Bluetooth: each command lets go later

    def test_done_survives_session_end(self):
        self.send(pre('Read'))
        self.run_for(1)
        self.send(ev('Stop'))
        self.send(ev('SessionEnd', reason='other'))              # claude -p: right after Stop
        self.run_for(4)
        self.assertEqual(self.board.current, 'claude__done')
        self.run_for(60)
        self.assertEqual(self.board.current, 'cycle')
        self.assertEqual(self.ctl.sessions, {})
        self.send(pre('Read', sid='quit'))                       # quitting mid-work: back at once
        self.run_for(4)
        self.send(ev('SessionEnd', sid='quit', reason='prompt_input_exit'))
        self.run_for(1)
        self.assertEqual(self.board.current, 'cycle')

    def test_dwell_and_latest_wins(self):
        self.send(ev('UserPromptSubmit', prompt='x'))
        self.ctl.tick()
        for i, tool in enumerate(['Read', 'Grep', 'Read', 'Glob', 'Edit']):
            self.send(pre(tool, tid=str(i)))
            self.send(post(tool, tid=str(i)))
            self.clock.t += 0.3
            self.ctl.tick()
        self.assertEqual(self.board.plays, ['claude__pondering'])   # still inside min_seconds
        self.run_for(2)
        self.assertEqual(self.board.plays, ['claude__pondering', 'claude__editing'])

    def test_attention_preempts_and_clears(self):
        self.send(ev('UserPromptSubmit', prompt='x'))
        self.send(pre('Bash', tid='b1', command='rm -rf build'))
        self.ctl.tick()
        self.clock.t += 0.5
        self.send(ev('PermissionRequest', tool_name='Bash', tool_input={'command': 'rm -rf build'}))
        self.ctl.tick()                                          # no waiting for min_seconds
        self.assertEqual(self.board.current, 'claude__permission')
        self.run_for(120)
        self.assertEqual(self.board.current, 'claude__permission')
        self.send(post('Bash', tid='b1', command='rm -rf build'))
        self.run_for(1)
        self.assertEqual(self.board.current, 'claude__coding')

    def test_parallel_result_does_not_clear_question(self):
        self.send(pre('Read', tid='r1'))
        self.send(pre('AskUserQuestion', tid='q1'))
        self.send(post('Read', tid='r1'))
        self.run_for(1)
        self.assertEqual(self.board.current, 'claude__permission')
        self.send(post('AskUserQuestion', tid='q1'))
        self.run_for(1)
        self.assertNotEqual(self.board.current, 'claude__permission')

    def test_attention_from_any_session_wins(self):
        self.send(pre('Edit', sid='a'))
        self.run_for(4)
        self.send(ev('Notification', sid='b', notification_type='permission_prompt', message='m'))
        self.send(pre('Read', sid='a', tid='t9'))
        self.run_for(1)
        self.assertEqual(self.board.current, 'claude__permission')

    def test_think_after_and_rotation(self):
        self.send(pre('Read'))
        self.send(post('Read'))
        self.run_for(9)
        self.assertEqual(self.board.current, 'claude__pondering')
        self.run_for(31)
        self.assertEqual(self.board.current, 'claude__thinking')   # long thinking alternates

    def test_long_command_and_subagents(self):
        self.send(pre('Bash', command='./build_everything.sh'))
        self.run_for(200)
        self.assertEqual(self.board.current, 'claude__infinite_loop')
        self.send(post('Bash', command='./build_everything.sh'))
        self.send(pre('Agent', tid='a1'))
        self.send(ev('SubagentStart', agent_id='x'))
        self.send(pre('Read', tid='sub1'))                      # the subagent's own tools
        self.run_for(4)
        self.assertEqual(self.board.current, 'claude__subagents')
        self.send(ev('SubagentStop', agent_id='x'))
        self.send(post('Agent', tid='a1'))
        self.send(pre('Edit', tid='e1'))
        self.run_for(4)
        self.assertEqual(self.board.current, 'claude__editing')

    def test_fallback_when_not_on_board(self):
        self.board.names = {'claude__spark', 'face_happy'}
        self.send(ev('UserPromptSubmit', prompt='x'))
        self.run_for(1)
        self.assertEqual(self.board.current, 'claude__spark')
        self.send(ev('Stop'))
        self.run_for(4)
        self.assertEqual(self.board.current, 'claude__spark')
        self.board.names = {'face_happy'}
        self.ctl.names = None                                    # rescan
        self.ctl.names_at = -1e9
        self.ctl.shown = None
        self.run_for(1)
        self.assertEqual(self.board.current, 'face_happy')

    def test_restores_previous_face_but_not_over_a_manual_pick(self):
        self.board.current = 'face_wink'
        self.board.names.add('face_wink')
        self.send(pre('Read'))
        self.run_for(1)
        self.send(ev('Stop'))
        self.run_for(70)
        self.assertEqual(self.board.current, 'face_wink')
        self.send(pre('Read', tid='z'))
        self.run_for(1)
        self.send(ev('Stop'))
        self.run_for(6)
        self.assertEqual(self.board.current, 'claude__done')
        self.board.current = 'face_happy'                        # someone picks a face meanwhile
        self.run_for(70)
        self.assertEqual(self.board.current, 'face_happy')
        self.assertFalse(self.ctl.active)

    def test_board_down_then_back(self):
        self.board.up = False
        self.send(pre('Read'))
        self.run_for(5)
        self.assertEqual(self.board.plays, [])
        self.board.up = True
        self.run_for(16)
        self.assertEqual(self.board.current, 'claude__reading')

    def test_language_animation_when_on_board(self):
        self.send(pre('Edit', file_path='/a.py'))
        self.run_for(1)
        self.assertEqual(self.board.current, 'claude__editing')  # no claude__python on the buddy
        self.board.names.add('claude__python')
        self.ctl.names = None
        self.ctl.names_at = -1e9
        self.send(pre('Edit', tid='t2', file_path='/b.py'))
        self.run_for(4)
        self.assertEqual(self.board.current, 'claude__python')

    def test_hold_for_another_program(self):
        closes = []
        self.board.close = lambda: closes.append(1)
        self.send(pre('Read'))
        self.run_for(1)
        self.ctl.hold(30)                                        # e.g. the simulator uploads over Bluetooth
        self.assertEqual(closes, [1])
        self.board.current = 'face_wave'                         # the upload played its animation
        self.send(pre('Edit', tid='e'))
        self.run_for(20)
        self.assertEqual(self.board.current, 'face_wave')        # hands off while holding
        self.run_for(12)
        self.assertEqual(self.board.current, 'claude__editing')  # and back afterwards
        self.ctl.hold(60)
        self.ctl.hold(0)                                         # ended early
        self.send(pre('Read', tid='r2'))
        self.run_for(4)                                          # after min_seconds of editing
        self.assertEqual(self.board.current, 'claude__reading')

    def test_overrides(self):
        self.ctl.cfg['animations'] = {'reading': 'face_happy', 'thinking': ['nope', 'claude__spark']}
        self.send(pre('Read'))
        self.run_for(1)
        self.assertEqual(self.board.current, 'face_happy')
        self.send(ev('UserPromptSubmit', prompt='x'))
        self.run_for(4)
        self.assertEqual(self.board.current, 'claude__spark')


class FakeBleClient:
    """Stands in for bleak's client: answers console commands like hardware/src/ble.cpp, as
    20-byte notifications on TX."""

    def __init__(self, names, current='cycle'):
        self.names, self.current, self.commands = list(names), current, []
        self.is_connected, self.silent, self.board = True, False, None

    async def write_gatt_char(self, char, data, response=None):
        cmd = bytes(data).decode().strip()
        self.commands.append(cmd)
        if self.silent:
            return
        if cmd == 'state':
            reply = 'state ' + json.dumps({'current': self.current, 'cycling': self.current == 'cycle', 'count': len(self.names)})
        elif cmd == 'names':
            reply = 'names ' + ','.join(self.names)
        elif cmd.startswith('play '):
            n = cmd[5:]
            if n == 'cycle' or n in self.names:
                self.current, reply = n, 'ok'
            else:
                reply = "no animation named '%s' (try: list)" % n
        else:
            reply = 'commands: ...'
        out = (reply + '\n').encode()
        for i in range(0, len(out), 20):
            self.board._on_tx(None, bytearray(out[i:i + 20]))

    async def disconnect(self):
        self.is_connected = False


class TestBleBoard(bb.BleBoard):
    def __init__(self, fake, **kw):
        super().__init__('', **kw)
        self.fake, self.connects, fake.board = fake, 0, self

    async def _ensure(self):
        if self.client is not None and self.client.is_connected:
            return
        self.connects += 1
        self.fake.is_connected = True
        self.lines, self.buf = bb.asyncio.Queue(), ''
        self.client, self.fresh = self.fake, True


class Bluetooth(unittest.TestCase):
    """BleBoard's console protocol over a fake link (the real one is checked on the board)."""

    def setUp(self):
        self.fake = FakeBleClient(CLAUDE + ['face_happy'] * 3)       # long enough to span many notifications
        self.board = TestBleBoard(self.fake, timeout=0.5, linger=0.3, pair_timeout=0.5)

    def tearDown(self):
        self.board.close()

    def test_status_and_names_cache(self):
        st = self.board.status()
        self.assertEqual(st['current'], 'cycle')
        self.assertIn('claude__done', bb.anim_names(st))
        self.board.status()
        self.assertEqual(self.fake.commands, ['state', 'names', 'state'])   # names only when count changes
        self.fake.names.append('claude__python')
        self.assertIn('claude__python', bb.anim_names(self.board.status()))
        self.assertEqual(self.fake.commands[-2:], ['state', 'names'])

    def test_play(self):
        self.assertEqual(self.board.play('claude__reading'), 'ok')
        self.assertEqual(self.fake.current, 'claude__reading')
        self.assertEqual(self.board.play('claude__nope'), 'missing')
        self.assertEqual(self.board.play('cycle'), 'ok')
        self.assertEqual(self.board.connects, 1)                          # one link for all of them

    def test_stale_reply_is_not_taken(self):
        self.board.status()
        self.board._on_tx(None, bytearray(b'ok\n'))                        # left over from a timed-out command
        self.assertEqual(self.board.play('claude__nope'), 'missing')

    def test_no_answer_drops_the_link(self):
        self.fake.silent = True
        t0 = time.time()
        self.assertEqual(self.board.play('claude__reading'), 'down')
        self.assertLess(time.time() - t0, 3)
        self.assertIsNone(self.board.client)
        self.fake.silent = False
        self.assertEqual(self.board.play('claude__reading'), 'ok')          # reconnects
        self.assertEqual(self.board.connects, 2)

    def test_release_after_linger_unless_used(self):
        self.board.play('claude__reading')
        self.board.release()
        time.sleep(0.1)
        self.board.play('claude__editing')                                  # used again: stays connected
        time.sleep(0.4)
        self.assertTrue(self.fake.is_connected)
        self.board.release()
        time.sleep(0.6)
        self.assertFalse(self.fake.is_connected)
        self.assertIsNone(self.board.client)

    def test_controller_over_bluetooth(self):
        home = tempfile.TemporaryDirectory()
        bb.STATE_FILE, bb.LOG_FILE = os.path.join(home.name, 's'), os.path.join(home.name, 'l')
        clock = Clock()
        ctl = bb.Controller(dict(bb.DEFAULTS), self.board, clock)
        ctl.apply(bb.classify(pre('Edit', file_path='/x.py')))
        ctl.tick()
        self.assertEqual(self.fake.current, 'claude__editing')
        ctl.apply(bb.classify(ev('Stop')))
        for _ in range(300):
            clock.t += 0.25
            ctl.tick()
        self.assertEqual(self.fake.current, 'cycle')
        time.sleep(0.6)
        self.assertFalse(self.fake.is_connected)                             # released once idle
        home.cleanup()


class FakeBuddy(BaseHTTPRequestHandler):
    """The two endpoints the bridge uses, like hardware/src/net.cpp."""
    state = {'current': 'cycle', 'plays': []}

    def _json(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/api/status':
            return self._json(200, {'current': self.state['current'], 'animations': CLAUDE + ['face_happy']})
        self._json(404, {})

    def do_POST(self):
        q = urllib.parse.urlparse(self.path)
        name = urllib.parse.parse_qs(q.query).get('name', [''])[0]
        if q.path == '/api/play' and (name == 'cycle' or name in CLAUDE):
            self.state['current'] = name
            self.state['plays'].append(name)
            return self._json(200, {'ok': True, 'current': name})
        self._json(404, {'error': 'unknown animation'})

    def log_message(self, *a):
        pass


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


class EndToEnd(unittest.TestCase):
    """The real hook command, which starts the real daemon, against a fake buddy."""

    def test_hook_starts_daemon_and_drives_buddy(self):
        buddy = ThreadingHTTPServer(('127.0.0.1', 0), FakeBuddy)
        threading.Thread(target=buddy.serve_forever, daemon=True).start()
        home = tempfile.mkdtemp()
        port = free_port()
        cfg = dict(bb.DEFAULTS, host='127.0.0.1:%d' % buddy.server_address[1], port=port,
                   min_seconds=0.3, done_seconds=1, think_after=30)
        with open(os.path.join(home, 'claude.json'), 'w') as f:
            json.dump(cfg, f)
        env = dict(os.environ, DESK_BUDDY_HOME=home)

        def hook(e):
            t0 = time.time()
            r = subprocess.run([sys.executable, os.path.join(HERE, 'buddy_bridge.py'), 'hook'],
                               input=json.dumps(e).encode(), capture_output=True, env=env, timeout=10)
            self.assertEqual((r.returncode, r.stdout, r.stderr), (0, b'', b''))   # hooks must stay silent
            return time.time() - t0

        def wait_for(name, timeout=5):
            end = time.time() + timeout
            while time.time() < end:
                if FakeBuddy.state['current'] == name:
                    return True
                time.sleep(0.05)
            self.fail('buddy never played %s (plays: %s)' % (name, FakeBuddy.state['plays']))

        try:
            hook(ev('UserPromptSubmit', prompt='hi'))            # starts the daemon
            wait_for('claude__pondering')
            took = hook(pre('Read', file_path='/x'))
            self.assertLess(took, 1.0)                            # never waits for the buddy
            wait_for('claude__reading')
            hook(ev('Notification', notification_type='permission_prompt', message='m'))
            wait_for('claude__permission')
            hook(ev('Stop'))
            wait_for('claude__done')
            wait_for('cycle', timeout=6)                          # done_seconds later: back to cycling
            self.assertFalse(os.path.exists(os.path.join(home, 'claude-state.json')))
        finally:
            try:
                bb.daemon_request(cfg, 'POST', '/stop', b'{}', timeout=2)
            except OSError:
                pass
            buddy.shutdown()
            buddy.server_close()


if __name__ == '__main__':
    unittest.main(verbosity=1)
