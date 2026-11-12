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
    commands = bb.BUDDY_COMMANDS

    def __init__(self, names, current='cycle'):
        self.names, self.current, self.plays, self.up = set(names), current, [], True
        self.releases = self.closes = 0
        self.brightness, self.screen, self.theme = 100, True, ''

    def describe(self):
        return 'fake'

    def release(self):
        self.releases += 1

    def close(self):
        self.closes += 1

    def status(self):
        if not self.up:
            return None
        return {'current': self.current, 'animations': sorted(self.names), 'brightness': self.brightness,
                'screen': self.screen, 'theme': self.theme}

    def command(self, cmd):
        """Replies like the console in hardware/src/main.cpp."""
        if not self.up:
            return None
        verb, _, arg = cmd.partition(' ')
        if verb in ('play', 'cycle'):
            r = self.play(arg if verb == 'play' else 'cycle')
            return 'ok' if r == 'ok' else "no animation named '%s' (try: list)" % arg
        if verb == 'brightness':
            if 10 <= int(arg) <= 100:
                self.brightness = int(arg)
            return 'brightness %d%%' % self.brightness
        if verb == 'screen':
            self.screen = arg == 'on'
            return 'ok'
        if verb == 'theme':
            self.theme = '' if arg == 'none' else arg
            return 'ok'
        return 'ok'

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

    def test_snapshot_for_the_menu_bar_app(self):
        self.send(pre('Read', sid='abcdef123456'))
        self.run_for(1)
        s = self.ctl.snapshot()
        self.assertEqual((s['showing'], s['activity'], s['link'], s['connected'], s['hold_s']),
                         ('claude__reading', 'reading', 'fake', None, 0))   # no connected(): HTTP-like
        self.assertEqual((s['sessions'][0]['id'], s['sessions'][0]['cwd']), ('abcdef12', '/w'))
        self.assertEqual(tuple(s['recent'][-1][1:]), ('reading', 'claude__reading'))
        self.assertEqual(s['pid'], os.getpid())
        self.ctl.hold(30)
        self.clock.t += 10
        self.assertEqual(self.ctl.snapshot()['hold_s'], 20)
        self.assertEqual(s['python'], sys.executable)
        json.dumps(s)                                            # what GET /status sends

    def test_manual_mode(self):
        self.send(pre('Read'))
        self.run_for(1)
        self.assertEqual(self.board.current, 'claude__reading')
        self.ctl.set_paused(True)                                # pause / the app's Manual
        self.run_for(1)
        self.assertEqual(self.board.current, 'cycle')            # back to what played before Claude
        self.assertEqual(self.board.closes, 1)                   # Bluetooth link freed at once
        self.assertTrue(self.ctl.snapshot()['paused'])
        self.assertEqual(self.ctl.snapshot()['sessions'], [])
        self.send(pre('Edit', tid='e'))                          # an event already on its way
        self.run_for(5)
        self.assertEqual(self.board.current, 'cycle')            # Claude does not change it
        self.assertEqual(self.ctl.buddy('play face_happy')[0], 200)   # the user picks
        self.send(ev('Stop'))
        self.run_for(70)
        self.assertEqual(self.board.current, 'face_happy')       # and it stays
        self.ctl.set_paused(False)                               # resume: follow Claude again
        self.send(pre('Read', tid='r'))
        self.run_for(1)
        self.assertEqual(self.board.current, 'claude__reading')

    def test_starts_paused_when_config_says_so(self):
        ctl = bb.Controller(dict(bb.DEFAULTS, enabled=False), self.board, self.clock)
        self.assertTrue(ctl.snapshot()['paused'])

    def test_buddy_controls_for_the_menu_bar_app(self):
        code, body = self.ctl.buddy()                            # GET /buddy: the state only
        self.assertEqual((code, body['ok'], body['buddy']['brightness']), (200, True, 100))
        self.assertEqual(body['commands'], list(bb.BUDDY_COMMANDS))
        self.assertNotIn('reply', body)
        code, body = self.ctl.buddy('brightness 40')
        self.assertEqual((code, body['ok'], body['reply'], body['buddy']['brightness']),
                         (200, True, 'brightness 40%', 40))
        self.assertEqual(self.ctl.buddy('screen off')[1]['buddy']['screen'], False)
        self.assertEqual(self.ctl.buddy('theme xmas')[1]['buddy']['theme'], 'xmas')
        self.assertEqual(self.ctl.buddy('play face_happy')[1]['buddy']['current'], 'face_happy')
        code, body = self.ctl.buddy('play nope')                 # the buddy says no: not ok, its words
        self.assertEqual((code, body['ok']), (200, False))
        self.assertIn('no animation named', body['error'])
        self.assertEqual(self.ctl.buddy('reset')[0], 400)        # not on the list: never sent
        self.assertGreater(self.board.releases, 0)               # Bluetooth link let go while idle
        self.ctl.hold(30)
        code, body = self.ctl.buddy('brightness 60')
        self.assertEqual((code, self.board.brightness), (409, 40))
        self.ctl.hold(0)
        self.board.up = False
        self.assertEqual(self.ctl.buddy('brightness 60')[0], 502)
        self.assertEqual(self.ctl.buddy()[0], 502)

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
        elif cmd.startswith('brightness '):
            reply = 'brightness %s%%' % cmd[11:]
        elif cmd in ('next', 'screen off'):
            reply = 'ok'
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

    def test_console_command(self):
        self.board.status()
        self.board._on_tx(None, bytearray(b'state {"current":"cycle"}\n'))   # a stale reply is skipped
        self.assertEqual(self.board.command('brightness 40'), 'brightness 40%')
        self.assertEqual(self.board.command('next'), 'ok')
        self.fake.silent = True
        self.assertIsNone(self.board.command('screen off'))

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
        self.assertIs(ctl.snapshot()['connected'], True)
        ctl.apply(bb.classify(ev('Stop')))
        for _ in range(300):
            clock.t += 0.25
            ctl.tick()
        self.assertEqual(self.fake.current, 'cycle')
        time.sleep(0.6)
        self.assertFalse(self.fake.is_connected)                             # released once idle
        self.assertIs(ctl.snapshot()['connected'], False)
        home.cleanup()


class FakeBuddy(BaseHTTPRequestHandler):
    """The endpoints the bridge uses, like hardware/src/net.cpp."""
    state = {'current': 'cycle', 'plays': [], 'brightness': 100, 'screen': True, 'theme': ''}

    def _json(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/api/status':
            s = self.state
            return self._json(200, {'current': s['current'], 'animations': CLAUDE + ['face_happy'],
                                    'brightness': s['brightness'], 'screen': s['screen'], 'theme': s['theme']})
        self._json(404, {})

    def do_POST(self):
        q = urllib.parse.urlparse(self.path)
        args = {k: v[0] for k, v in urllib.parse.parse_qs(q.query, keep_blank_values=True).items()}
        name = args.get('name', '')
        if q.path == '/api/play' and (name == 'cycle' or name in CLAUDE):
            self.state['current'] = name
            self.state['plays'].append(name)
            return self._json(200, {'ok': True, 'current': name})
        if q.path == '/api/brightness':
            if not 10 <= int(args.get('value') or 0) <= 100:
                return self._json(400, {'error': 'brightness is 10 to 100'})
            self.state['brightness'] = int(args['value'])
            return self._json(200, {'ok': True, 'brightness': self.state['brightness']})
        if q.path == '/api/screen':
            self.state['screen'] = args.get('on') == '1'
            return self._json(200, {'ok': True, 'on': self.state['screen']})
        if q.path == '/api/theme':
            self.state['theme'] = name
            return self._json(200, {'ok': True, 'theme': name})
        self._json(404, {'error': 'unknown animation'})

    def log_message(self, *a):
        pass


def free_port():
    s = socket.socket()
    s.bind(('127.0.0.1', 0))
    p = s.getsockname()[1]
    s.close()
    return p


class HttpBoard(unittest.TestCase):
    """Board.command: the menu bar app's commands on the HTTP API."""

    def test_commands_map_onto_endpoints(self):
        buddy = ThreadingHTTPServer(('127.0.0.1', 0), FakeBuddy)
        threading.Thread(target=buddy.serve_forever, daemon=True).start()
        try:
            b = bb.Board('127.0.0.1:%d' % buddy.server_address[1], timeout=2)
            self.assertEqual(b.command('brightness 40'), 'ok')
            self.assertEqual(b.command('brightness 5'), 'brightness is 10 to 100')   # the buddy's error
            self.assertEqual(b.command('screen off'), 'ok')
            self.assertEqual(b.command('theme xmas'), 'ok')
            self.assertEqual(b.command('theme none'), 'ok')
            self.assertEqual(b.command('play claude__done'), 'ok')
            self.assertEqual(b.command('play nope'), 'unknown animation')
            self.assertEqual(b.command('cycle'), 'ok')
            st = b.status()
            self.assertEqual((st['brightness'], st['screen'], st['theme'], st['current']), (40, False, '', 'cycle'))
            self.assertNotIn('next', b.commands)
            self.assertIn('not available', b.command('next'))
        finally:
            buddy.shutdown()
            buddy.server_close()
        self.assertIsNone(b.command('brightness 50'))           # nobody there


class EndToEnd(unittest.TestCase):
    """The real hook command, which starts the real daemon, against a fake buddy."""

    def test_start_command(self):
        home = tempfile.mkdtemp()
        cfg = dict(bb.DEFAULTS, host='127.0.0.1:9', port=free_port())
        with open(os.path.join(home, 'claude.json'), 'w') as f:
            json.dump(cfg, f)
        env = dict(os.environ, DESK_BUDDY_HOME=home)

        def run(sub):
            r = subprocess.run([sys.executable, os.path.join(HERE, 'buddy_bridge.py'), sub],
                               capture_output=True, env=env, timeout=10)
            return r.returncode, r.stdout.decode().strip()

        def status():
            return bb.daemon_request(cfg, 'GET', '/status', timeout=2)[1]

        def enabled():
            with open(os.path.join(home, 'claude.json')) as f:
                return json.load(f)['enabled']
        try:
            self.assertEqual(run('start'), (0, 'daemon running'))
            self.assertEqual(run('start'), (0, 'daemon already running'))
            self.assertEqual((status()['sessions'], status()['paused']), ([], False))
            self.assertEqual(run('pause')[0], 0)                  # manual: the daemon stays up, paused
            self.assertEqual((status()['paused'], enabled()), (True, False))
            self.assertEqual(run('resume')[0], 0)
            self.assertEqual((status()['paused'], enabled()), (False, True))
        finally:
            try:
                bb.daemon_request(cfg, 'POST', '/stop', b'{}', timeout=2)
            except OSError:
                pass

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
            # the menu bar app: buddy controls through the daemon, and the daemon's Python on record
            code, body = bb.daemon_request(cfg, 'POST', '/buddy', b'{"command": "brightness 30"}', timeout=5)
            self.assertEqual((code, body['ok'], body['buddy']['brightness']), (200, True, 30))
            code, body = bb.daemon_request(cfg, 'GET', '/buddy', timeout=5)
            self.assertEqual((code, body['buddy']['current']), (200, 'cycle'))
            self.assertEqual(bb.daemon_request(cfg, 'POST', '/buddy', b'{"command": "reset"}')[0], 400)
            self.assertEqual(bb.daemon_request(cfg, 'POST', '/buddy', b'not json')[0], 400)
            with open(os.path.join(home, 'claude-python')) as f:
                self.assertEqual(f.read().strip(), sys.executable)
        finally:
            try:
                bb.daemon_request(cfg, 'POST', '/stop', b'{}', timeout=2)
            except OSError:
                pass
            buddy.shutdown()
            buddy.server_close()


if __name__ == '__main__':
    unittest.main(verbosity=1)
