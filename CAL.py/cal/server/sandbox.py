import os
import resource
import signal
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass

# 輸出上限：stdout/stderr 直接寫入暫存檔，由 RLIMIT_FSIZE 限制大小，
# 避免無窮輸出把整個後端記憶體吃光。
OUTPUT_LIMIT_BYTES = 1 * 1024 * 1024
CPU_SECONDS = 2
MEM_MB = 256


@dataclass
class RunResult:
    ok: bool
    stdout: str
    stderr: str
    exit_code: int
    time_ms: int


def _set_limits():
    resource.setrlimit(resource.RLIMIT_CPU, (CPU_SECONDS, CPU_SECONDS))
    try:
        resource.setrlimit(resource.RLIMIT_AS, (MEM_MB * 1024 * 1024, MEM_MB * 1024 * 1024))
    except Exception:
        pass
    resource.setrlimit(resource.RLIMIT_FSIZE, (OUTPUT_LIMIT_BYTES, OUTPUT_LIMIT_BYTES))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))


def _kill_process_group(proc: subprocess.Popen):
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except OSError:
        pass


def _read_text(path: str) -> str:
    with open(path, "rb") as f:
        data = f.read(OUTPUT_LIMIT_BYTES)
    return data.decode("utf-8", errors="replace")


def run_python(code: str, stdin: str = "", timeout_ms: int = 2000) -> RunResult:
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "main.py")
        in_path = os.path.join(tmp, "stdin.txt")
        out_path = os.path.join(tmp, "stdout.txt")
        err_path = os.path.join(tmp, "stderr.txt")
        with open(src, "w", encoding="utf-8") as f:
            f.write(code)
        with open(in_path, "w", encoding="utf-8") as f:
            f.write(stdin)

        timed_out = False
        start = time.monotonic()
        with open(in_path, "rb") as fin, open(out_path, "wb") as fout, open(err_path, "wb") as ferr:
            proc = subprocess.Popen(
                [sys.executable, "-S", "-B", "-E", src],
                stdin=fin,
                stdout=fout,
                stderr=ferr,
                cwd=tmp,
                env={"PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"},
                start_new_session=True,
                preexec_fn=_set_limits,
            )
            try:
                proc.wait(timeout=timeout_ms / 1000.0)
            except subprocess.TimeoutExpired:
                timed_out = True
                _kill_process_group(proc)
                proc.wait()
            # 清掉可能殘留的子行程
            _kill_process_group(proc)
        ms = int((time.monotonic() - start) * 1000)

        # Python 預設忽略 SIGXFSZ，超過上限時會改丟 OSError（File too large）
        stdout = _read_text(out_path)
        stderr = _read_text(err_path)
        rc = proc.returncode

        # RLIMIT_CPU 觸發時會收到 SIGXCPU / SIGKILL，皆視為超時
        if timed_out or rc in (-signal.SIGXCPU, -signal.SIGKILL):
            stderr = _append_line(stderr, f"Time Limit Exceeded（超過時間限制 {timeout_ms} ms）")
        elif rc == -signal.SIGXFSZ or os.path.getsize(out_path) >= OUTPUT_LIMIT_BYTES:
            stderr = _append_line(stderr, f"Output Limit Exceeded（輸出超過 {OUTPUT_LIMIT_BYTES // 1024} KB）")

        return RunResult(rc == 0 and not timed_out, stdout, stderr, rc, ms)


def _append_line(text: str, line: str) -> str:
    if text and not text.endswith("\n"):
        text += "\n"
    return text + line + "\n"
