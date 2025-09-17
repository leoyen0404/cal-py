import os, glob
from dataclasses import dataclass
from typing import List, Optional
from .sandbox import run_python, RunResult

@dataclass
class CaseResult:
    idx: int
    ok: bool
    expected: str
    actual: str
    time_ms: int
    error: Optional[str]

@dataclass
class JudgeSummary:
    total: int
    passed: int
    cases: List[CaseResult]


def load_tests(base_dir:str):
    ins = sorted(glob.glob(os.path.join(base_dir, "*.in")))
    cases = []
    for i, infile in enumerate(ins, start=1):
        out_path = os.path.splitext(infile)[0] + ".out"
        expected = ""
        if os.path.exists(out_path):
            with open(out_path, "r", encoding="utf-8") as f:
                expected = f.read()
        with open(infile, "r", encoding="utf-8") as f:
            input_data = f.read()
        cases.append((i, input_data, expected))
    return cases


def judge_python(code:str, tests_dir:str, timeout_ms:int=2000) -> JudgeSummary:
    tests = load_tests(tests_dir)
    results: List[CaseResult] = []
    passed = 0
    for idx, input_data, expected in tests:
        res: RunResult = run_python(code, input_data, timeout_ms)
        ok = res.ok and (res.stdout == expected)
        if ok:
            passed += 1
        results.append(CaseResult(
            idx=idx,
            ok=ok,
            expected=expected,
            actual=res.stdout,
            time_ms=res.time_ms,
            error=None if res.ok else res.stderr
        ))
    return JudgeSummary(total=len(tests), passed=passed, cases=results)
