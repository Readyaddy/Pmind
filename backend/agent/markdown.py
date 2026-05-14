"""
Lightweight Markdown → Tiptap-JSON converter.

Tiptap stores docs as a tree of nodes. The agent writes Markdown (much easier
to generate); we convert here so the saved doc is a real Tiptap document the
editor can render. Supported:
  - # / ## / ### headings (1–3)
  - blank-line paragraph splits
  - "- " bullet lists, "1. " ordered lists
  - inline **bold**, *italic*, `code`
  - GFM tables: | Col | Col | / |---|---| / | val | val |

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


_TABLE_ROW = re.compile(r"^\|(.+)\|$")
_TABLE_SEP = re.compile(r"^\|[\s|:-]+\|$")


def _table_cell(text: str, header: bool) -> dict[str, Any]:
    return {
        "type": "tableHeader" if header else "tableCell",
        "attrs": {"colspan": 1, "rowspan": 1, "colwidth": None},
        "content": [{"type": "paragraph", "content": _inline(text.strip())}],
    }


def _parse_table(lines: list[str], start: int) -> tuple[dict[str, Any] | None, int]:
    """Try to parse a GFM table starting at `start`. Returns (node, next_i) or (None, start)."""
    if start >= len(lines):
        return None, start

    header_line = lines[start].strip()
    if not _TABLE_ROW.match(header_line):
        return None, start

    # Next line must be the separator row
    sep_i = start + 1
    if sep_i >= len(lines) or not _TABLE_SEP.match(lines[sep_i].strip()):
        return None, start

    # Collect body rows
    row_i = sep_i + 1
    body_rows: list[str] = []
    while row_i < len(lines) and _TABLE_ROW.match(lines[row_i].strip()):
        body_rows.append(lines[row_i].strip())
        row_i += 1

    def split_row(raw: str) -> list[str]:
        return [c for c in raw.strip("|").split("|")]

    headers = split_row(header_line)
    table_rows: list[dict] = []

    table_rows.append({
        "type": "tableRow",
        "content": [_table_cell(h, header=True) for h in headers],
    })
    for raw in body_rows:
        cells = split_row(raw)
        # Pad or trim to match header count
        while len(cells) < len(headers):
            cells.append("")
        cells = cells[: len(headers)]
        table_rows.append({
            "type": "tableRow",
            "content": [_table_cell(c, header=False) for c in cells],
        })

    return {"type": "table", "content": table_rows}, row_i


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

        # GFM table
        table_node, next_i = _parse_table(lines, i)
        if table_node:
            nodes.append(table_node)
            i = next_i
            continue

        # Paragraph: collect consecutive non-empty, non-special lines
        para_lines: list[str] = []
        while i < len(lines):
            cur = lines[i].strip()
            if not cur:
                break
            if (
                re.match(r"^(#{1,3})\s+", cur)
                or re.match(r"^[-*]\s+", cur)
                or re.match(r"^\d+\.\s+", cur)
                or _TABLE_ROW.match(cur)
            ):
                break
            para_lines.append(cur)
            i += 1
        if para_lines:
            nodes.append({
                "type": "paragraph",
                "content": _inline(" ".join(para_lines)),
            })

    return {"type": "doc", "content": nodes or [{"type": "paragraph"}]}
