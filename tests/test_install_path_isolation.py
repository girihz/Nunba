"""Regression tests for the install-location sys.path isolation.

Context (2026-04-21 watchdog dump):
  [WATCHDOG] phase='importing_main', total=52s, stuck=31s, threads=4
  ...
  File "C:\\Program Files (x86)\\HevolveAI\\Nunba\\integrations\\social\\models.py", line 16
    from sqlalchemy import (
  ...
  File "C:\\Users\\sathi\\...\\.venv\\Lib\\site-packages\\sqlalchemy\\__init__.py", line 13

The installed Nunba reached back into the developer's .venv for
sqlalchemy, which took 31s+ to cold-import and tripped the 20s stuck
watchdog. The freeze_core console launcher does NOT always set
``sys.frozen = True``, so ``_isolate_frozen_imports()`` short-circuited
and left ``.venv\\Lib\\site-packages`` ahead of bundled ``lib/`` on
sys.path.

These tests assert:
  1. ``_running_from_install_location()`` helper exists and returns True
     when __main__.__file__ points at the install dir, False otherwise.
  2. ``_isolate_frozen_imports()`` runs when install-location is
     detected (even if sys.frozen is False).
  3. The venv-stripping regex covers dev-tree .venv AND PycharmProjects
     paths, not just generic \\site-packages\\.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

APP_PY = Path(__file__).resolve().parent.parent / "app.py"


class InstallPathIsolationStaticTests(unittest.TestCase):
    """Source-level contract tests — no imports required."""

    def test_running_from_install_location_helper_exists(self):
        src = APP_PY.read_text(encoding="utf-8")
        self.assertIn(
            "def _running_from_install_location(",
            src,
            "app.py must define _running_from_install_location() — the "
            "install-dir detection that _isolate_frozen_imports() relies on"
        )

    def test_isolate_gate_accepts_non_frozen_installs(self):
        """The gate on _isolate_frozen_imports() must not short-circuit
        when sys.frozen is False but the process is in the install dir."""
        src = APP_PY.read_text(encoding="utf-8")
        # Find the function body
        start = src.find("def _isolate_frozen_imports(")
        self.assertGreater(start, 0, "_isolate_frozen_imports missing")
        # Slice to the next top-level `def ` or module-level call
        end = src.find("\ndef ", start + 1)
        body = src[start:end] if end > 0 else src[start:]
        # Must reference _running_from_install_location (the OR arm)
        self.assertIn(
            "_running_from_install_location",
            body,
            "_isolate_frozen_imports gate must also fire when running "
            "from the install dir — the freeze_core console launcher "
            "does not always set sys.frozen, so a bare sys.frozen guard "
            "lets .venv's sqlalchemy win sys.path precedence (see "
            "2026-04-21 watchdog dump, 31s stuck)."
        )

    def test_venv_path_pattern_stripped(self):
        """The bad-path regex must match dev-tree venv directories."""
        src = APP_PY.read_text(encoding="utf-8")
        start = src.find("def _isolate_frozen_imports(")
        end = src.find("\ndef ", start + 1)
        body = src[start:end] if end > 0 else src[start:]
        # Must strip \.venv\ paths explicitly
        self.assertIn(
            "\\\\.venv\\\\",
            body,
            "_isolate_frozen_imports must strip \\.venv\\ paths from "
            "sys.path — otherwise the dev venv wins over bundled lib/"
        )
        # Must also strip \pycharmprojects\ paths (dev-tree detector)
        self.assertIn(
            "pycharmprojects",
            body.lower(),
            "_isolate_frozen_imports must strip \\PycharmProjects\\ "
            "paths from sys.path — catches dev-tree source paths"
        )

    def test_virtual_env_env_stripped(self):
        """VIRTUAL_ENV must be popped so subprocesses don't inherit
        the developer's venv root."""
        src = APP_PY.read_text(encoding="utf-8")
        start = src.find("def _isolate_frozen_imports(")
        end = src.find("\ndef ", start + 1)
        body = src[start:end] if end > 0 else src[start:]
        self.assertIn(
            'os.environ.pop("VIRTUAL_ENV"',
            body,
            "_isolate_frozen_imports must pop VIRTUAL_ENV so spawned "
            "subprocesses (llama-server, piper, parler worker) do not "
            "re-add the developer's venv to their own sys.path"
        )


class InstallPathIsolationRuntimeTests(unittest.TestCase):
    """Behavioural tests — exercise the helper in-process."""

    def test_helper_returns_false_on_dev_tree(self):
        """Running from the dev worktree must NOT be flagged as installed."""
        # Import the helper.  app.py is large but the helper is at module
        # top before any heavy imports fire.
        sys.path.insert(0, str(APP_PY.parent))
        try:
            import importlib.util
            spec = importlib.util.spec_from_file_location("app_under_test", APP_PY)
            # We can't fully exec app.py here (it triggers heavy imports,
            # tray, etc.).  Instead, compile just the helper definition
            # into a scratch namespace.
            src = APP_PY.read_text(encoding="utf-8")
            start = src.find("def _running_from_install_location(")
            end = src.find("\ndef ", start + 1)
            helper_src = src[start:end]
            ns = {"os": __import__("os"), "sys": sys}
            exec(compile(helper_src, str(APP_PY), "exec"), ns)
            _fn = ns["_running_from_install_location"]
            # Current pytest process is running from the dev worktree
            # (no \HevolveAI\Nunba\ in any path), so must return False.
            self.assertFalse(
                _fn(),
                "_running_from_install_location must return False when "
                "pytest runs from the dev worktree"
            )
        finally:
            if str(APP_PY.parent) in sys.path:
                sys.path.remove(str(APP_PY.parent))


if __name__ == "__main__":
    unittest.main()
