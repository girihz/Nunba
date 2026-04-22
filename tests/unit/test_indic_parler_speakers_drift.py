"""Drift-guard: Nunba's _SPEAKERS must stay equal to HARTOS's canonical map.

The Nunba copy (tts/indic_parler_worker.py:_SPEAKERS) exists because the
worker runs inside an isolated venv where the HARTOS package isn't
importable. Without this guard, the two dicts can silently drift —
language→speaker drops to 'Divya' fallback for any new language HARTOS
adds, and Indic Parler audio quality regresses for that language.
"""
import ast
from pathlib import Path

import pytest


def _extract_speakers_dict(py_path: Path) -> dict:
    """Parse `_SPEAKERS = {...}` literal from a .py file via AST (no import)."""
    tree = ast.parse(py_path.read_text(encoding='utf-8'))
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign):
            for tgt in node.targets:
                if isinstance(tgt, ast.Name) and tgt.id == '_SPEAKERS':
                    return ast.literal_eval(node.value)
    raise AssertionError(f"_SPEAKERS not found in {py_path}")


def test_nunba_speakers_matches_hartos():
    nunba = Path(__file__).resolve().parents[2] / 'tts' / 'indic_parler_worker.py'
    hartos = (Path(__file__).resolve().parents[3] / 'HARTOS' /
              'integrations' / 'service_tools' / 'indic_parler_tool.py')
    if not hartos.is_file():
        pytest.skip(f"HARTOS sibling not found at {hartos}")
    n = _extract_speakers_dict(nunba)
    h = _extract_speakers_dict(hartos)
    assert n == h, (
        f"_SPEAKERS drift: Nunba has keys not in HARTOS: "
        f"{sorted(set(n) - set(h))}; HARTOS has keys not in Nunba: "
        f"{sorted(set(h) - set(n))}"
    )
