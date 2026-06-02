# CAL.py

CAL.py is a browser-based Python practice platform inspired by a school CAL coding system originally built around C exercises. It keeps the classroom workflow familiar while swapping in a local FastAPI judge for Python submissions.

The project is intentionally lightweight: static HTML/CSS/JavaScript for the student UI, Ace Editor for code editing, and a small Python backend for running and judging solutions against per-topic test cases.

## Highlights

- Interactive topic pages with problem text, code editor, stdin input, terminal output, and pass/fail judging.
- Sequential topic unlocks stored locally for a simple learning-path prototype.
- FastAPI backend with resource-limited Python execution and per-problem test discovery.
- No frontend build step, so the app is easy to run in Codespaces, locally, or from a static server.
- Smoke test script and GitHub Actions workflow for basic backend/judge validation.

## Repository Layout

```text
CAL.py/
  cal/
    server/          FastAPI backend and judging sandbox
    shared/          Shared topic page assets
    topic/           Topic shell plus individual problem folders
    topiclist/       Student topic list
    leaderboard/     Demo leaderboard page
  users/login/       Prototype login screen
scripts/
  start.sh           Local/Codespaces startup helper
```

## Quick Start

```bash
cd CAL.py
python3 -m venv .venv
source .venv/bin/activate
pip install -r cal/server/requirements.txt
python -m uvicorn cal.server.main:app --reload --port 8000
```

In a second terminal:

```bash
cd CAL.py
python3 -m http.server 5173
```

Open <http://127.0.0.1:5173/users/login/?next=/cal/topiclist/>.

You can also run both services with:

```bash
./scripts/start.sh
```

## Verification

Run the smoke checks from the repository root:

```bash
python3 scripts/smoke_test.py
```

The test validates direct judge behavior and the FastAPI `/api/run` and `/api/judge/{problem_id}` endpoints.

## Status

This is a polished prototype rather than a production LMS. Authentication and leaderboard data are local demo flows, while the judging backend is functional for local Python practice.
