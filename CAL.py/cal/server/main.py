from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os, json
from typing import Optional
from .sandbox import run_python
from .judge import judge_python

app = FastAPI(title="CAL.py Backend", version="0.1.0")

# 允許從本機前端呼叫
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class RunRequest(BaseModel):
    language: str = "python"
    code: str
    stdin: Optional[str] = ""
    timeout_ms: Optional[int] = 2000

class RunResponse(BaseModel):
    ok: bool
    stdout: str
    stderr: str
    exit_code: int
    time_ms: int

class JudgeRequest(BaseModel):
    language: str = "python"
    code: str
    timeout_ms: Optional[int] = 2000

@app.get("/api/health")
def health():
    return {"ok": True}

@app.post("/api/run", response_model=RunResponse)
def run(req: RunRequest):
    if req.language != "python":
        raise HTTPException(status_code=400, detail="Only python is supported")
    res = run_python(req.code, req.stdin or "", req.timeout_ms or 2000)
    return RunResponse(
        ok=res.ok,
        stdout=res.stdout,
        stderr=res.stderr,
        exit_code=res.exit_code,
        time_ms=res.time_ms,
    )

@app.post("/api/judge/{problem_id}")
def judge(problem_id:str, req: JudgeRequest):
    if req.language != "python":
        raise HTTPException(status_code=400, detail="Only python is supported")
    # 測資目錄: /cal/topic/<id>/tests
    root = os.path.dirname(os.path.dirname(__file__))  # /cal/server -> /cal
    tests_dir = os.path.join(root, "topic", problem_id, "tests")
    if not os.path.isdir(tests_dir):
        raise HTTPException(status_code=404, detail=f"Tests not found: {tests_dir}")
    result = judge_python(req.code, tests_dir, req.timeout_ms or 2000)
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
