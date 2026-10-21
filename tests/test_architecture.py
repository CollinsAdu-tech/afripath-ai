"""Layering rules, checked on the Python source with the ast module."""

import ast
import re

from conftest import ROOT

PKG = ROOT / "pathfinder"


def modules(sub):
    return [(f"{sub}/{p.name}", p.read_text("utf-8")) for p in sorted((PKG / sub).glob("*.py"))]


def imports_of(text):
    out = []
    for n in ast.walk(ast.parse(text)):
        if isinstance(n, ast.Import):
            out += [a.name for a in n.names]
        elif isinstance(n, ast.ImportFrom):
            out.append("." * n.level + (n.module or ""))
    return out


def test_knowledge_layer_independent():
    for f, text in modules("knowledge"):
        for i in imports_of(text):
            assert not re.search(r"engine|api", i), f"{f} imports {i}"


def test_engine_core_is_pure():
    banned_mods = {"os", "pathlib", "socket", "http", "urllib", "requests", "httpx", "random", "time", "datetime", "subprocess"}
    for f, text in modules("engine"):
        for i in imports_of(text):
            assert i.split(".")[0] not in banned_mods, f"{f} imports {i}"
            assert "api" not in i.split("."), f"{f} imports {i}"
            if "knowledge" in i:
                assert i in ("..knowledge.base", "..knowledge"), f"{f}: engine may use only the pure KB module, not the file loader"
        code = re.sub(r"#.*$", "", text, flags=re.M)
        for bad in [r"\bos\.environ", r"datetime\.now", r"time\.time\(", r"\brandom\.", r"\bopen\("]:
            assert not re.search(bad, code), f"{f} uses {bad}"


def test_api_depends_on_engine_facade_only():
    for f, text in modules("api"):
        if f in ("api/app.py", "api/main.py"):
            continue  # composition root: wires the KB loader
        for i in imports_of(text):
            assert "knowledge" not in i, f"{f} imports {i}"
    for i in imports_of((PKG / "api" / "handlers.py").read_text("utf-8")):
        assert i in ("__future__", "time", "typing", "..engine", "..engine.validate", "..util", ".errors"), i


def test_weights_only_in_config():
    for f, text in [*modules("engine"), *modules("api"), *modules("knowledge")]:
        if f == "engine/config.py":
            continue
        code = re.sub(r"#.*$", "", text, flags=re.M)
        assert not re.search(r"0\.35|\"interests\":\s*0\.", code), f"{f} appears to hard-code a weight"
