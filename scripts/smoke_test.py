from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = ROOT / "CAL.py"
sys.path.insert(0, str(APP_ROOT))

from fastapi.testclient import TestClient  # noqa: E402
from cal.server.judge import judge_python  # noqa: E402
from cal.server.main import app  # noqa: E402


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def test_direct_judge():
    tests_dir = APP_ROOT / "cal" / "topic" / "520001" / "tests"
    result = judge_python('print("Hello")\n', str(tests_dir))
    assert_true(result.total == 1, "expected one sample test for topic 520001")
    assert_true(result.passed == 1, "expected Hello solution to pass")


def test_api():
    client = TestClient(app)

    health = client.get("/api/health")
    assert_true(health.status_code == 200, "health endpoint should return 200")
    assert_true(health.json()["ok"] is True, "health endpoint should report ok")

    run = client.post(
        "/api/run",
        json={"language": "python", "code": "print(2 + 3)\n", "stdin": ""},
    )
    assert_true(run.status_code == 200, "run endpoint should return 200")
    assert_true(run.json()["stdout"] == "5\n", "run endpoint should capture stdout")

    judge = client.post(
        "/api/judge/520001",
        json={"language": "python", "code": 'print("Hello")\n'},
    )
    assert_true(judge.status_code == 200, "judge endpoint should return 200")
    assert_true(judge.json()["passed"] == judge.json()["total"], "judge should pass")


if __name__ == "__main__":
    test_direct_judge()
    test_api()
    print("smoke tests passed")
