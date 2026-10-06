from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = ROOT / "CAL.py"
sys.path.insert(0, str(APP_ROOT))

from fastapi.testclient import TestClient  # noqa: E402
from cal.server.judge import judge_python  # noqa: E402
from cal.server.main import app  # noqa: E402
from cal.server.sandbox import OUTPUT_LIMIT_BYTES, run_python  # noqa: E402

TOPIC_ROOT = APP_ROOT / "cal" / "topic"

# Reference solutions: every topic must be solvable and its tests consistent.
REFERENCE_SOLUTIONS = {
    "520001": 'print("Hello")\n',
    "520002": "x = 5\nprint(x)\n",
    "520003": 'print("Hello World")\n',
    "520004": "result = 84 // 2\nprint(result)\n",
    "520005": "a = 5\nb = 8\nprint((a + b) // 2)\n",
    "520006": "a = int(input())\nb = int(input())\nprint(a + b)\n",
    "520007": (
        "score = int(input())\n"
        "if score >= 90:\n    print('A')\n"
        "elif score >= 80:\n    print('B')\n"
        "elif score >= 70:\n    print('C')\n"
        "elif score >= 60:\n    print('D')\n"
        "else:\n    print('F')\n"
    ),
    "520008": (
        "n = int(input())\ntotal = 0\n"
        "for i in range(1, n + 1):\n    print(i)\n    total += i\n"
        'print("Sum =", total)\n'
    ),
}


def assert_true(condition, message):
    if not condition:
        raise AssertionError(message)


def test_direct_judge():
    tests_dir = APP_ROOT / "cal" / "topic" / "520001" / "tests"
    result = judge_python('print("Hello")\n', str(tests_dir))
    assert_true(result.total == 1, "expected one sample test for topic 520001")
    assert_true(result.passed == 1, "expected Hello solution to pass")


def test_all_topics():
    topic_ids = sorted(p.name for p in TOPIC_ROOT.iterdir() if p.name.isdecimal())
    assert_true(
        topic_ids == sorted(REFERENCE_SOLUTIONS),
        f"every topic needs a reference solution: {topic_ids}",
    )
    for topic_id in topic_ids:
        topic = TOPIC_ROOT / topic_id
        for name in ("index.html", "instructions.md", "config.json"):
            assert_true((topic / name).is_file(), f"{topic_id} missing {name}")
        result = judge_python(REFERENCE_SOLUTIONS[topic_id], str(topic / "tests"))
        assert_true(result.total >= 1, f"{topic_id} should have tests")
        assert_true(
            result.passed == result.total,
            f"{topic_id} reference solution failed: {result.cases}",
        )


def test_new_topics_reject_wrong_answers():
    # Off-by-one boundary and range() mistakes must not pass.
    wrong_grade = "s = int(input())\nprint('A' if s > 90 else 'B' if s > 80 else 'C' if s > 70 else 'D' if s > 60 else 'F')\n"
    result = judge_python(wrong_grade, str(TOPIC_ROOT / "520007" / "tests"))
    assert_true(result.passed < result.total, "boundary mistakes should fail 520007")

    wrong_loop = "n = int(input())\nfor i in range(1, n):\n    print(i)\nprint('Sum =', sum(range(1, n)))\n"
    result = judge_python(wrong_loop, str(TOPIC_ROOT / "520008" / "tests"))
    assert_true(result.passed == 0, "range off-by-one should fail 520008")


def test_output_normalization():
    tests_dir = TOPIC_ROOT / "520001" / "tests"
    result = judge_python('print("Hello", end="")\n', str(tests_dir))
    assert_true(result.passed == 1, "missing trailing newline should still pass")
    result = judge_python('print("Hell")\n', str(tests_dir))
    assert_true(result.passed == 0, "wrong output should fail")


def test_sandbox_limits():
    res = run_python("while True:\n    pass\n", "", 500)
    assert_true(not res.ok, "infinite loop should not succeed")
    assert_true("Time Limit Exceeded" in res.stderr, "timeout should be reported")

    res = run_python('while True:\n    print("x" * 1000)\n', "", 3000)
    assert_true(not res.ok, "output flood should not succeed")
    assert_true(len(res.stdout) <= OUTPUT_LIMIT_BYTES, "stdout should be capped")
    assert_true("Output Limit Exceeded" in res.stderr, "output cap should be reported")

    res = run_python('import sys\nsys.stdout.buffer.write(b"\\xff\\n")\n')
    assert_true(res.ok, "non-UTF-8 output should not crash the runner")


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
    test_all_topics()
    test_new_topics_reject_wrong_answers()
    test_output_normalization()
    test_sandbox_limits()
    test_api()
    print("smoke tests passed")
