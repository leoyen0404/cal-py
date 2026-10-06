# CAL.py — Frontend + Python Backend

This repo contains a no-build frontend (pure HTML/CSS/JS) and a small FastAPI backend to run and judge Python code locally.

## Structure

- cal/topic/: Shared topic shell (`?id=<topic>`) with Ace editor, resizable panes, and terminal.
- cal/topic/<id>/: One folder per topic (`instructions.md`, `config.json`, `tests/*.in|*.out`).
- cal/topiclist/: Topic list with sequential unlocks.
- cal/server/: FastAPI backend exposing /api/run and /api/judge.

## Prerequisites

- Python 3.9+
- macOS (tested), should work on Unix-like systems

## Setup (Backend)

1) Create a virtualenv and activate it

```
python3 -m venv .venv
source .venv/bin/activate
```

2) Install dependencies

```
pip install -r cal/server/requirements.txt
```

3) Run the backend server

```
python3 -m uvicorn cal.server.main:app --reload --port 8000
```

Backend will listen on http://127.0.0.1:8000 .

## Frontend

Open the course page in your browser:

- serve the `CAL.py/` folder with a static server (required: pages use absolute `/cal/...` paths)

VS Code tasks:

- Start backend: "Start CAL.py backend (uvicorn)"
- Serve frontend: "Serve frontend (http.server 8080)"

Then visit http://127.0.0.1:8080/cal/topiclist/ .

Tip: You can override API base via query param:

- `index.html?api=http://127.0.0.1:8000`

When running in GitHub Codespaces, the page will attempt to infer the backend URL automatically (port 8000 on the same preview domain). You can still force it via `?api=` as above.

## Usage

- Run button: sends your code and stdin to /api/run and shows stdout/stderr.
- Judge button: runs your code against every case in `cal/topic/<id>/tests` and reports pass/fail per case. Trailing whitespace and trailing blank lines are ignored when comparing output.

## Topics

| # | ID | Topic |
|---|----|-------|
| 1 | 520001 | 程式導論與 Hello World |
| 2 | 520002 | 變數宣告與資料型態 |
| 3 | 520003 | 語法錯誤與除錯 |
| 4 | 520004 | 執行時錯誤（Runtime Error） |
| 5 | 520005 | 邏輯錯誤（Wrong Answer） |
| 6 | 520006 | 輸入讀取與型態轉換 |
| 7 | 520007 | 條件判斷 if / elif / else |
| 8 | 520008 | 迴圈 for 與 range() |

To add a topic, copy an existing folder to the next sequential id, edit its files, and add an entry to the `topics` array in `cal/topiclist/index.html`. Unlocks assume ids are consecutive.

## Notes

- The sandbox uses resource limits (CPU time, memory, 1 MB output cap) and a wall-clock timeout on Unix/macOS. It is not a security boundary; do not run untrusted code.
- Only Python is supported at the moment.
