# CAL.py — Frontend + Python Backend

This repo contains a no-build frontend (pure HTML/CSS/JS) and a small FastAPI backend to run and judge Python code locally.

## Structure

- cal/topic/520012/: Course page with Ace editor, resizable panes, and terminal.
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

- file path: `cal/topic/520012/index.html`
- or serve a static server (recommended to avoid CORS/file issues)

VS Code tasks:

- Start backend: "Start CAL.py backend (uvicorn)"
- Serve frontend: "Serve frontend (http.server 8080)"

Then visit http://127.0.0.1:8080/cal/topic/520012/ .

Tip: You can override API base via query param:

- `index.html?api=http://127.0.0.1:8000`

When running in GitHub Codespaces, the page will attempt to infer the backend URL automatically (port 8000 on the same preview domain). You can still force it via `?api=` as above.

## Usage

- Run button: sends your code and stdin to /api/run and shows stdout/stderr.
- Judge button: runs your code against tests in cal/topic/520012/tests and reports pass/fail per case.

## Notes

- The sandbox uses resource limits (CPU/file size) available on Unix/macOS. Do not run untrusted code.
- Only Python is supported at the moment.
