from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .sandbox import run_python
from .judge import judge_python

app = FastAPI(
    title="CAL.py Backend",
    version="0.2.0",
    summary="Local Python runner and judge service for CAL.py practice topics.",
)

# 允許從本機前端呼叫
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RunRequest(BaseModel):
    language: Literal["python"] = "python"
    code: str = Field(..., min_length=1, max_length=100_000)
    stdin: str = Field(default="", max_length=20_000)
    timeout_ms: int = Field(default=2000, ge=250, le=5000)

class RunResponse(BaseModel):
    ok: bool
    stdout: str
    stderr: str
    exit_code: int
    time_ms: int

class JudgeRequest(BaseModel):
    language: Literal["python"] = "python"
    code: str = Field(..., min_length=1, max_length=100_000)
    timeout_ms: int = Field(default=2000, ge=250, le=5000)


class CaseResponse(BaseModel):
    idx: int
    ok: bool
    expected: str
    actual: str
    time_ms: int
    error: Optional[str]


class JudgeResponse(BaseModel):
    total: int
    passed: int
    cases: list[CaseResponse]


@app.get("/api/health")
def health():
    return {"ok": True, "service": "CAL.py Backend"}

@app.post("/api/run", response_model=RunResponse)
def run(req: RunRequest):
    res = run_python(req.code, req.stdin, req.timeout_ms)
    return RunResponse(
        ok=res.ok,
        stdout=res.stdout,
        stderr=res.stderr,
        exit_code=res.exit_code,
        time_ms=res.time_ms,
    )

@app.post("/api/judge/{problem_id}", response_model=JudgeResponse)
def judge(problem_id:str, req: JudgeRequest):
    if not problem_id.isdecimal():
        raise HTTPException(status_code=400, detail="Problem id must be numeric")

    root = Path(__file__).resolve().parents[1]
    tests_dir = root / "topic" / problem_id / "tests"
    if not tests_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Tests not found for problem {problem_id}")

    result = judge_python(req.code, str(tests_dir), req.timeout_ms)
    return {
        "total": result.total,
        "passed": result.passed,
        "cases": [
            {
                "idx": c.idx,
                "ok": c.ok,
                "expected": c.expected,
                "actual": c.actual,
                "time_ms": c.time_ms,
                "error": c.error,
            }
            for c in result.cases
        ],
    }
