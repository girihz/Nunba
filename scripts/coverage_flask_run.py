"""Wrapper that starts Nunba's Flask app under coverage.py parallel
mode so that any HTTP traffic (Cypress, curl, external probes)
exercising the backend contributes to Python runtime coverage.

Usage:
    python scripts/coverage_flask_run.py --port 5000

On shutdown (SIGTERM / SIGINT / exit), the atexit handler
coverage.Coverage.save() flushes the parallel-mode .coverage.*
fragment. A subsequent `coverage combine` in the regression runner
merges every Flask session's fragment with the pytest fragments into
a single aggregate measurement.

Why a wrapper:
    - pytest-cov covers pytest invocations.
    - Cypress invocations are browser-driven — not pytest.
    - Without this wrapper, Cypress would drive hundreds of real
      Flask handlers while coverage.py records nothing, producing a
      false-low Python coverage number.

Parallel mode is set via the imported `coverage` module (not the
shell `coverage run`) so the wrapper process IS the Flask process —
no parent/child pid split, no handlers-not-instrumented gap.
"""

from __future__ import annotations

import atexit
import os
import signal
import sys
from pathlib import Path

# Start coverage BEFORE any app module is imported.  Otherwise every
# function def / class def at module-init time is missed.
import coverage

_cov = coverage.Coverage(
    config_file=str(Path(__file__).resolve().parent.parent / ".coveragerc"),
    auto_data=True,   # parallel mode filenames (.coverage.hostname.pid.NNN)
    branch=True,
)
_cov.start()


def _flush_coverage(*_args, **_kwargs):
    try:
        _cov.stop()
        _cov.save()
    except Exception:
        pass


atexit.register(_flush_coverage)
signal.signal(signal.SIGINT, lambda *a: (_flush_coverage(), sys.exit(0)))
signal.signal(signal.SIGTERM, lambda *a: (_flush_coverage(), sys.exit(0)))

# Allow the real Nunba main.py to run. Same CLI args apply (--port etc.).
# The import triggers all module-init side effects under coverage.
os.environ.setdefault("NUNBA_SKIP_SINGLE_INSTANCE", "1")

# Re-exec Nunba's main() with the existing argv (already contains --port).
sys.argv[0] = "main.py"
_main_path = Path(__file__).resolve().parent.parent / "main.py"
sys.path.insert(0, str(_main_path.parent))

# runpy preserves __main__ semantics so Flask's app.run(...) actually fires.
import runpy  # noqa: E402

try:
    runpy.run_path(str(_main_path), run_name="__main__")
finally:
    _flush_coverage()
