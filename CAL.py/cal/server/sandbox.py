import os, subprocess, tempfile, signal, threading, time, resource
from dataclasses import dataclass
from typing import Optional

@dataclass
class RunResult:
    ok: bool
    stdout: str
    stderr: str
    exit_code: int
    time_ms: int

# 設定資源上限（僅於 Unix 類系統）
def _set_limits(cpu_seconds:int=2, mem_mb:int=256, file_mb:int=8):
    resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
    try:
        resource.setrlimit(resource.RLIMIT_AS, (mem_mb*1024*1024, mem_mb*1024*1024))
    except Exception:
        pass
    resource.setrlimit(resource.RLIMIT_FSIZE, (file_mb*1024*1024, file_mb*1024*1024))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))

# 以牆上時間（wall time）防止卡住
def _run_proc(args:list[str], input_str:str="", cwd:Optional[str]=None, wall_ms:int=2000):
    start = time.time()
    proc = subprocess.Popen(
        args,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=cwd,
        preexec_fn=lambda: (os.setsid(), _set_limits()),
        text=True
    )
    killer = threading.Timer(wall_ms/1000.0, lambda: os.killpg(os.getpgid(proc.pid), signal.SIGKILL))
    killer.start()
    try:
        out, err = proc.communicate(input=input_str)
    finally:
        killer.cancel()
    ms = int((time.time() - start)*1000)
    return out, err, proc.returncode, ms

# 執行 Python 程式碼

def run_python(code:str, stdin:str="", timeout_ms:int=2000) -> RunResult:
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "main.py")
        with open(src, "w", encoding="utf-8") as f:
            f.write(code)
        o, e, rc, ms = _run_proc(["python3","-S","-B","-E", src], input_str=stdin, cwd=tmp, wall_ms=timeout_ms)
        return RunResult(rc==0, o, e, rc, ms)
