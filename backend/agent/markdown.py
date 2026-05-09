"""
Lightweight Markdown → Tiptap-JSON converter.

Tiptap stores docs as a tree of nodes. The agent writes Markdown (much easier
to generate); we convert here so the saved doc is a real Tiptap document the
editor can render. Supported:
  - # / ## / ### headings (1–3)
  - blank-line paragraph splits
  - "- " bullet lists, "1. " ordered lists
  - inline **bold**, *italic*, `code`

Anything else lands as a plain paragraph. Good enough for PRDs / briefs;
the user can hand-format inside the editor afterward.
"""
import re
from typing import Any


_BOLD = re.compile(r"\*\*(.+?)\*\*")
_ITALIC = re.compile(r"(?<!\*)\*(?!\*)(.+?)\*(?!\*)")
_CODE = re.compile(r"`([^`]+)`")


def _inline(text: str) -> list[dict[str, Any]]:
    """Convert one line of inline markdown to Tiptap text nodes."""
    if not text:
        return []
    spans: list[tuple[int, int, str, list[dict]]] = []
    for pat, mark in [(_BOLD, "bold"), (_ITALIC, "italic"), (_CODE, "code")]:
        for m in pat.finditer(text):
            spans.append((m.start(), m.end(), m.group(1), [{"type": mark}]))
    if not spans:
        return [{"type": "text", "text": text}]

    spans.sort(key=lambda s: s[0])
    nodes: list[dict] = []
    cursor = 0
    for start, end, inner, marks in spans:
        if start < cursor:
            continue  # overlapping, skip
        if start > cursor:
            nodes.append({"type": "text", "text": text[cursor:start]})
        nodes.append({"type": "text", "text": inner, "marks": marks})
        cursor = end
    if cursor < len(text):
        nodes.append({"type": "text", "text": text[cursor:]})
    return nodes


def _list_item(text: str) -> dict[str, Any]:
    return {
        "type": "listItem",
        "content": [{"type": "paragraph", "content": _inline(text)}],
    }


def markdown_to_tiptap(md: str) -> dict[str, Any]:
    """Parse markdown into a Tiptap doc JSON."""
    if not md or not md.strip():
        return {"type": "doc", "content": [{"type": "paragraph"}]}

    lines = md.replace("\r\n", "\n").split("\n")
    nodes: list[dict] = []
    i = 0

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        # Headings
        m = re.match(r"^(#{1,3})\s+(.+)$", stripped)
        if m:
            level = len(m.group(1))
            nodes.append({
                "type": "heading",
                "attrs": {"level": level},
                "content": _inline(m.group(2)),
            })
            i += 1
            continue

        # Bullet list
        if re.match(r"^[-*]\s+", stripped):
            items = []
            while i < len(lines) and re.match(r"^[-*]\s+", lines[i].strip()):
                items.append(_list_item(re.sub(r"^[-*]\s+", "", lines[i].strip())))
                i += 1
            nodes.append({"type": "bulletList", "content": items})
            continue

        # Ordered list
        if re.match(r"^\d+\.\s+", stripped):
            items = []
            while i < len(lines) and re.match(r"^\d+\.\s+", lines[i].strip()):
                items.append(_list_item(re.sub(r"^\d+\.\s+", "", lines[i].strip())))
                i += 1
            nodes.append({"type": "orderedList", "content": items})
            continue

        # Paragraph: collect consecutive non-empty, non-special lines
        para_lines: list[str] = []
        while i < len(lines):
            cur = lines[i].strip()
            if not cur:
                break
            if re.match(r"^(#{1,3})\s+", cur) or re.match(r"^[-*]\s+", cur) or re.match(r"^\d+\.\s+", cur):
                break
            para_lines.append(cur)
            i += 1
        if para_lines:
            nodes.append({
                "type": "paragraph",
                "content": _inline(" ".join(para_lines)),
            })

    return {"type": "doc", "content": nodes or [{"type": "paragraph"}]}
