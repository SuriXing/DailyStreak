#!/usr/bin/env python3
"""Project-local UXE static drift gate.

DailyStreak theming is JS-first: the Ant Design palette lives in
``src/constants/theme.ts`` as ``Colors.light`` / ``Colors.dark`` (per
``.uxe/design-contract-note.md``).  This gate therefore resolves the required
tokens from that JS theme instead of CSS custom properties, flags raw hex only
in UI *component* files (``src/app`` / ``src/components``), treats the token
source file itself as definitions, and checks light/dark token parity.
"""
import argparse
import json
import re
from pathlib import Path

IGNORED = {".git", ".next", ".uxe", "build", "coverage", "dist", "node_modules", "playwright-report", "test-results"}
SUFFIXES = {".css", ".scss", ".tsx", ".ts", ".jsx", ".js", ".html"}
# Only real UI component files are "component CSS". Data / core / token files are
# the source of values, not inline styling, so they are not flagged.
RAW_HEX_DIRS = {"app", "components"}
THEME_FILE = Path("src/constants/theme.ts")
VAR_DEF = re.compile(r"(--[A-Za-z0-9_-]+)\s*:\s*([^;}{]+)")
VAR_USE = re.compile(r"var\(\s*(--[A-Za-z0-9_-]+)")
HEX = re.compile(r"(?<![\w-])#[0-9a-fA-F]{3,8}\b")
# White text on an accent / colored surface (on-color) is antd's on-color text token.
ON_ACCENT = {"#fff", "#ffffff"}
TYPE_PROP = re.compile(r"\b(font-size|line-height|font-weight)\s*:\s*(?!var\()([^;}{]+)")
# canonical token (token-map.json) -> Colors key in src/constants/theme.ts
TOKEN_KEY = {
    "surface": "background",
    "surface-raised": "backgroundElement",
    "text": "text",
    "text-muted": "textSecondary",
    "accent": "primary",
    "border": "border",
    "focus-ring": "primary",
}
# (foreground token, background token, min contrast ratio)
CONTRAST_PAIRS = [("text", "surface", 4.5), ("text-muted", "surface", 3.0), ("focus-ring", "surface", 3.0)]


def project_files(root):
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix not in SUFFIXES:
            continue
        if any(part in IGNORED for part in path.parts):
            continue
        yield path


def read_text(path):
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return ""


def load_json(root, name):
    path = root / ".uxe" / name
    if not path.exists():
        raise SystemExit(f"UXE check failed: missing {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def collect_sources(root):
    files = list(project_files(root))
    chunks = [(path, read_text(path)) for path in files]
    return chunks, "\n".join(text for _, text in chunks)


def collect_var_defs(chunks):
    values = {}
    for path, text in chunks:
        for token, value in VAR_DEF.findall(text):
            values.setdefault(token, []).append((path, value.strip()))
    return values


def parse_js_theme(text):
    """Extract ``Colors.light`` and ``Colors.dark`` key->hex maps from theme.ts."""
    m = re.search(r"Colors\s*=\s*\{", text)
    if not m:
        return {}, {}
    body = text[m.end():]
    depth = 1
    end = len(body)
    for i, ch in enumerate(body):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    body = body[:end]
    lm = re.search(r"\blight\s*:\s*\{", body)
    dm = re.search(r"\bdark\s*:\s*\{", body)
    pairs = re.compile(r"(\w+)\s*:\s*'#([0-9a-fA-F]{3,8})'")

    def read_block(seg):
        return {key: "#" + value for key, value in pairs.findall(seg)}

    light = read_block(body[lm.end(): dm.start()]) if lm and dm else {}
    dark = read_block(body[dm.end():]) if dm else {}
    return light, dark


def required_color_tokens(token_map):
    return [item.get("canonical") for item in token_map.get("required_maps", {}).get("color", []) if item.get("canonical")]


def missing_tokens(token_map, light, dark):
    missing = []
    for canonical in required_color_tokens(token_map):
        key = TOKEN_KEY.get(canonical)
        if not key or key not in light or key not in dark:
            missing.append(canonical)
    return missing


def undefined_vars(chunks, var_defs):
    issues = []
    defined = set(var_defs)
    for path, text in chunks:
        for token in VAR_USE.findall(text):
            if token not in defined:
                issues.append(f"{path}:{token}")
    return issues[:50]


def hardcoded_hex(chunks):
    issues = []
    for path, text in chunks:
        if path.name == THEME_FILE.name:
            continue  # token source file
        if not any(part in RAW_HEX_DIRS for part in path.parts):
            continue  # only UI component files
        for line_no, line in enumerate(text.splitlines(), 1):
            searchable = re.sub(r"--[A-Za-z0-9_-]+\s*:\s*[^;}{]+;?", "", line)
            hits = [h for h in HEX.findall(searchable) if h.lower() not in ON_ACCENT]
            if hits:
                issues.append(f"{path}:{line_no}:{','.join(sorted(set(hits)))}")
    return issues[:50]


def hardcoded_type(chunks):
    issues = []
    for path, text in chunks:
        for line_no, line in enumerate(text.splitlines(), 1):
            searchable = re.sub(r"--[A-Za-z0-9_-]+\s*:\s*[^;}{]+;?", "", line)
            for prop, value in TYPE_PROP.findall(searchable):
                value = value.strip()
                if value in {"inherit", "normal"}:
                    continue
                issues.append(f"{path}:{line_no}:{prop}:{value}")
    return issues[:50]


def parse_hex(value):
    match = HEX.search(value)
    if not match:
        return None
    raw = match.group(0).lstrip("#")
    if len(raw) == 3:
        raw = "".join(ch * 2 for ch in raw)
    if len(raw) not in {6, 8}:
        return None
    return tuple(int(raw[i:i + 2], 16) for i in (0, 2, 4))


def luminance(rgb):
    vals = []
    for channel in rgb:
        c = channel / 255
        vals.append(c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * vals[0] + 0.7152 * vals[1] + 0.0722 * vals[2]


def contrast_ratio(a, b):
    la = luminance(a)
    lb = luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def contrast_issues(light):
    issues = []

    def color_of(canonical):
        return parse_hex(light.get(TOKEN_KEY.get(canonical, "")) or "")

    for fg, bg, threshold in CONTRAST_PAIRS:
        fg_color = color_of(fg)
        bg_color = color_of(bg)
        if not fg_color or not bg_color:
            continue
        ratio = contrast_ratio(fg_color, bg_color)
        if ratio < threshold:
            issues.append(f"{fg} on {bg}: {ratio:.2f} < {threshold}")
    return issues


def dark_mode_issues(light, dark):
    if not dark:
        return ["missing_dark_mode"]
    missing = sorted(key for key in light if key not in dark)
    return [f"dark_missing:{key}" for key in missing[:30]]


def main():
    parser = argparse.ArgumentParser(description="Run UXE token, contrast, and drift checks.")
    parser.add_argument("--project-root", default=".")
    args = parser.parse_args()
    root = Path(args.project_root).resolve()
    token_map = load_json(root, "token-map.json")
    chunks, _ = collect_sources(root)
    theme_text = read_text(root / THEME_FILE)
    light, dark = parse_js_theme(theme_text)
    var_defs = collect_var_defs(chunks)
    failures = {
        "missing_tokens": missing_tokens(token_map, light, dark),
        "undefined_css_vars": undefined_vars(chunks, var_defs),
        "raw_hex_outside_tokens": hardcoded_hex(chunks),
        "hardcoded_typography": hardcoded_type(chunks),
        "contrast": contrast_issues(light),
        "dark_light_asymmetry": dark_mode_issues(light, dark),
    }
    failures = {key: value for key, value in failures.items() if value}
    if failures:
        print("UXE check failed")
        print(json.dumps(failures, indent=2))
        return 1
    print("UXE check passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
