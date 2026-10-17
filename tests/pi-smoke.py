"""Drive an isolated installed Pi TUI without making a model request (macOS/Linux)."""

import fcntl
import json
import os
from pathlib import Path
import pty
import select
import shutil
import struct
import subprocess
import tempfile
import termios
import time


ENTRY = Path(__file__).resolve().parents[1] / "index.ts"
PI = shutil.which("pi")
if not PI:
    raise SystemExit("Install Pi before running the TUI smoke check.")


def drain(fd, seconds):
    deadline = time.monotonic() + seconds
    output = bytearray()
    while time.monotonic() < deadline:
        if select.select([fd], [], [], min(0.1, max(0, deadline - time.monotonic())))[0]:
            try:
                output.extend(os.read(fd, 65536))
            except OSError:
                break
    return output


def check(token, expected):
    with tempfile.TemporaryDirectory(prefix="inline-slash-tui-") as root:
        root = Path(root)
        agent = root / "agent"
        (agent / "prompts").mkdir(parents=True)
        (agent / "prompts" / "review.md").write_text(
            "---\ndescription: Review changes.\n---\nReview changes.\nReport ${1:-correctness}.\n"
        )
        skill = agent / "skills" / "pdf-tools"
        skill.mkdir(parents=True)
        (skill / "SKILL.md").write_text(
            "---\nname: pdf-tools\ndescription: Read PDFs.\n---\nRead the PDF.\n"
        )
        snapshot = root / "snapshot.json"
        capture = root / "capture.ts"
        capture.write_text('''import { writeFileSync } from "node:fs";
export default function (pi) {
  pi.registerShortcut("ctrl+alt+d", {
    description: "Capture isolated smoke-test editor",
    handler: async (ctx) => {
      writeFileSync(process.env.INLINE_SLASH_SNAPSHOT, JSON.stringify({text: ctx.ui.getEditorText()}));
    },
  });
}
''')
        master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 32, 110, 0, 0))
        env = {**os.environ, "PI_CODING_AGENT_DIR": str(agent), "PI_TELEMETRY": "0",
               "PI_OFFLINE": "1", "INLINE_SLASH_SNAPSHOT": str(snapshot), "TERM": "xterm-256color"}
        process = subprocess.Popen(
            [PI, "--offline", "--no-session", "--no-extensions", "--no-context-files",
             "--no-approve", "--no-themes", "--tui-mode", "regular", "-e", str(ENTRY), "-e", str(capture)],
            cwd=root, env=env, stdin=slave, stdout=slave, stderr=slave, start_new_session=True,
        )
        os.close(slave)
        output = bytearray()
        try:
            output.extend(drain(master, 2))
            assert process.poll() is None, output.decode(errors="replace")[-4000:]
            os.write(master, b"Context")
            output.extend(drain(master, 0.1))
            os.write(master, b"\x0a")
            output.extend(drain(master, 0.1))
            for char in token.encode():
                os.write(master, bytes([char]))
                output.extend(drain(master, 0.04))
            output.extend(drain(master, 0.2))
            os.write(master, b"\t")
            output.extend(drain(master, 0.2))
            os.write(master, b"\x1b\x04")
            deadline = time.monotonic() + 3
            while not snapshot.exists() and time.monotonic() < deadline:
                output.extend(drain(master, 0.1))
            assert snapshot.exists(), output.decode(errors="replace")[-6000:]
            text = json.loads(snapshot.read_text())["text"]
            assert expected in text, repr(text)
            assert text.startswith("Context\n"), repr(text)
            assert token not in text, repr(text)
            os.write(master, b"\x03")
            output.extend(drain(master, 0.1))
            os.write(master, b"/quit\r")
            deadline = time.monotonic() + 3
            while process.poll() is None and time.monotonic() < deadline:
                output.extend(drain(master, 0.1))
            assert process.poll() == 0, output.decode(errors="replace")[-4000:]
            print(f"PASS real Pi TUI: {token} expands at the start of line 2")
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=2)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=2)
            os.close(master)


check("/rev", "Review changes.\nReport correctness.")
check("/skill:pdf", "Read the PDF.\n</skill>")
