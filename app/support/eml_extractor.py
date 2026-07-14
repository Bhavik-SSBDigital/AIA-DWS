#!/usr/bin/env python3
"""
EML Extractor with JSON output for Node.js integration.

Key change vs previous version:
--------------------------------
Attachment classification ("is this a real attachment the sender
intended to send, or just a logo/signature image baked into every
message of the thread by their mail client's template?") now happens
HERE, not in the Node controller.

The Node side previously guessed this with sharp() pixel-dimension
checks + filename regexes + cid lookups scattered across a
classifyAttachments() function. That was unreliable and lived in the
wrong layer: Node doesn't have visibility into the whole thread's
attachment set, so it could only ever look at one attachment at a
time.

The most reliable signal is available right here, at parse time:

    A genuine attachment the user (or the last replier) intended to
    send appears ONCE. A template logo/signature image is embedded by
    the mail client and therefore appears IDENTICALLY, byte-for-byte,
    in every message of the thread that includes that template.

So the primary signal is content-hash recurrence across the whole
thread. Filename pattern / disposition / cid-reference / pixel
dimensions are demoted to a secondary, best-effort fallback used only
when an inline image happens to appear just once (e.g. a one-off
inline screenshot vs a one-off small logo - here we still need *some*
heuristic, since duplication can't help you when there's nothing to
compare against).

Node no longer needs to know any of this. It just reads
`is_likely_logo` (and `classification_reason`, for auditability) off
each attachment record and filters.
"""
import gc
import hashlib
import json
import os
import re
import sys
import tempfile
import uuid
from collections import Counter
from dataclasses import dataclass, asdict
from email import policy
from email.message import Message
from email.parser import BytesParser
from pathlib import Path
from typing import Dict, List, Optional, Tuple

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# Large-file safety: refuse to process an EML above this size instead of
# silently trying to load it all into memory. Adjust to your real needs.
MAX_EML_SIZE_BYTES = int(os.environ.get("EML_MAX_SIZE_BYTES", 200 * 1024 * 1024))  # 200MB

# Secondary, best-effort signal used ONLY when an inline image appears
# just once in the thread (so duplicate-hash detection has nothing to
# compare against). A crisp small PNG can still be a real attachment,
# so this alone is never sufficient - it's combined with filename
# and/or cid signals in classify_attachments().
LOGO_MAX_DIMENSION_PX = int(os.environ.get("LOGO_MAX_DIMENSION_PX", 300))

# Anything inline whose filename matches these patterns is almost
# certainly a mail-client-generated signature/logo image, regardless
# of size (Outlook/Gmail/Apple Mail all use these conventions).
LOGO_FILENAME_PATTERN = re.compile(r"^(image\d{3,}|logo|signature|banner|spacer|icon)\b", re.IGNORECASE)


# -----------------------------
# File helpers & Cleaners
# -----------------------------
def safe_filename(name: str) -> str:
    name = (name or "").strip().replace("\x00", "")
    name = name.replace("\\", "").replace("/", "")
    name = re.sub(r"[\r\n\t]", " ", name)
    name = re.sub(r'[:*?"<>|]', "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name or "file"


def _clean_body_urls(text: str) -> str:
    """Removes raw mailto:... and http:... tags from plain text bodies."""
    if not text:
        return ""
    text = re.sub(r"mailto:[^\s>]+>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<https?://[^>]+>", "", text, flags=re.IGNORECASE)
    return text.strip()


# -----------------------------
# Email body extraction
# -----------------------------
def _html_to_text_basic(html: str) -> str:
    if not html:
        return ""
    html = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", "", html)
    html = re.sub(r"(?i)<br\s*/?>", "\n", html)
    html = re.sub(r"(?i)</p\s*>", "\n\n", html)
    text = re.sub(r"(?is)<.*?>", "", html)
    text = (
        text.replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&#39;", "'")
    )
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return _clean_body_urls(text)


def _get_body_text(msg: Message) -> str:
    plain_parts: List[str] = []
    html_parts: List[str] = []

    for part in msg.walk():
        if part.is_multipart():
            continue

        disp = (part.get_content_disposition() or "").lower()
        if disp == "attachment":
            continue

        ctype = part.get_content_type()
        if not (ctype.startswith("text/plain") or ctype.startswith("text/html")):
            continue

        try:
            content = part.get_content()
        except Exception:
            raw = part.get_payload(decode=True) or b""
            charset = part.get_content_charset() or "utf-8"
            content = raw.decode(charset, errors="replace")

        content_str = str(content).strip()
        if not content_str:
            continue

        if ctype.startswith("text/plain"):
            plain_parts.append(content_str)
        else:
            html_parts.append(content_str)

    if plain_parts:
        return _clean_body_urls("\n\n".join(plain_parts))
    if html_parts:
        return _html_to_text_basic("\n\n".join(html_parts))
    return ""


def _get_body_html(msg: Message) -> str:
    html_parts: List[str] = []
    for part in msg.walk():
        if part.is_multipart():
            continue
        disp = (part.get_content_disposition() or "").lower()
        if disp == "attachment":
            continue
        ctype = part.get_content_type()
        if not ctype.startswith("text/html"):
            continue
        try:
            content = part.get_content()
        except Exception:
            raw = part.get_payload(decode=True) or b""
            charset = part.get_content_charset() or "utf-8"
            content = raw.decode(charset, errors="replace")

        content_str = str(content).strip()
        if content_str:
            html_parts.append(content_str)

    return "\n\n".join(html_parts).strip()


# -----------------------------
# Message ID extraction & Threading
# -----------------------------
def _extract_msg_ids(header_val: str) -> List[str]:
    if not header_val:
        return []
    ids = re.findall(r"<[^>]+>", header_val)
    return [i.strip() for i in ids if i.strip()]


def _safe_text(s: Optional[str]) -> str:
    return (s or "").strip()


def _clean_content_id(cid: Optional[str]) -> str:
    if not cid:
        return ""
    return cid.strip().lstrip("<").rstrip(">")


@dataclass
class EmailNode:
    uid: str
    source: str
    subject: str
    from_: str
    to: str
    cc: str
    bcc: str
    date: str
    body_plain: str
    body_html: str
    body_text: str
    message_id: str
    in_reply_to: List[str]
    references: List[str]
    headers: Dict
    attachments_filenames: List[str]
    attachments: List[Dict]
    containment_parent_uid: Optional[str] = None


def _message_to_node(msg: Message, uid: str, source: str, containment_parent_uid: Optional[str]) -> EmailNode:
    headers_dict = {}
    for key, value in msg.items():
        if key not in headers_dict:
            headers_dict[key] = value

    return EmailNode(
        uid=uid,
        source=source,
        subject=_safe_text(msg.get("Subject")),
        from_=_safe_text(msg.get("From")),
        to=_safe_text(msg.get("To")),
        cc=_safe_text(msg.get("Cc")),
        bcc=_safe_text(msg.get("Bcc")),
        date=_safe_text(msg.get("Date")),
        body_plain=_get_body_text(msg),
        body_html=_get_body_html(msg),
        body_text=_get_body_text(msg),
        message_id=_safe_text(msg.get("Message-ID")),
        in_reply_to=_extract_msg_ids(_safe_text(msg.get("In-Reply-To"))),
        references=_extract_msg_ids(_safe_text(msg.get("References"))),
        headers=headers_dict,
        attachments_filenames=[],
        attachments=[],
        containment_parent_uid=containment_parent_uid,
    )


def _image_dimensions(file_path: Path) -> Tuple[int, int]:
    """Best-effort pixel dimensions. Never raises - just returns (0, 0)
    if the file can't be read as an image or Pillow isn't installed."""
    if not HAS_PIL:
        return (0, 0)
    try:
        with Image.open(file_path) as img:
            return img.size  # (width, height)
    except Exception:
        return (0, 0)


def _is_referenced_by_cid(content_id: str, html_body: str) -> bool:
    if not content_id or not html_body:
        return False
    needle = f"cid:{content_id}".lower()
    return needle in html_body.lower()


def _looks_like_logo_filename(filename: str) -> bool:
    return bool(LOGO_FILENAME_PATTERN.match(filename or ""))


def _collect_attachments(msg: Message, out_dir: Path, own_html_body: str) -> List[Dict]:
    """Writes each attachment straight to disk under out_dir and returns
    metadata only (no base64 payload). Also computes a content hash and
    pixel dimensions up front, since both are needed for classification
    later - hashing/dimension-reading here is a single pass over bytes
    we already have in memory, instead of re-reading from disk twice."""
    metadata: List[Dict] = []

    for part in msg.walk():
        if part.is_multipart():
            continue

        # get_filename() checks BOTH Content-Disposition's filename param
        # and Content-Type's name param, so this alone reliably tells us
        # "this part is a named file", independent of whether the sender's
        # mail system bothered to set Content-Disposition at all. Some
        # webmail/relay/forwarding systems omit Content-Disposition
        # entirely on real attachments while still setting a name - the
        # previous version required an explicit "attachment" or "inline"
        # value here and silently dropped every one of those, which is
        # why genuine attachments were vanishing while inline signature
        # logos (which reliably DO carry Content-Disposition: inline)
        # kept coming through.
        filename = part.get_filename()
        if not filename:
            continue

        raw_disposition = (part.get_content_disposition() or "").lower()
        # No explicit header but it has a filename -> treat it as a real
        # attachment by default, NOT as inline. Only images explicitly
        # marked inline are ever candidates for the logo classification
        # below.
        disposition = raw_disposition if raw_disposition in ("attachment", "inline") else "attachment"

        payload = part.get_payload(decode=True)
        if payload is None:
            continue

        content_type = part.get_content_type() or "application/octet-stream"
        content_id = _clean_content_id(part.get("Content-ID"))

        safe_name = safe_filename(filename)
        unique_name = f"{uuid.uuid4().hex}_{safe_name}"
        dest_path = out_dir / unique_name

        with open(dest_path, "wb") as fh:
            fh.write(payload)

        size = len(payload)
        content_hash = hashlib.sha256(payload).hexdigest()

        width, height = (0, 0)
        if content_type.lower().startswith("image/"):
            width, height = _image_dimensions(dest_path)

        # Drop the reference immediately; don't let it linger in `part`
        # or in this frame any longer than necessary.
        payload = None

        metadata.append(
            {
                "filename": filename,
                "size": size,
                "content_type": content_type,
                "disposition": disposition,
                "content_id": content_id,
                "content_hash": content_hash,
                "width": width,
                "height": height,
                "file_path": str(dest_path),
                "referenced_by_cid_in_own_message": _is_referenced_by_cid(content_id, own_html_body),
                "associated_email_subject": _safe_text(msg.get("Subject")),
                "associated_email_from": _safe_text(msg.get("From")),
                # filled in by classify_attachments() once the full
                # thread's attachment set is known:
                "is_likely_logo": False,
                "classification_reason": None,
            }
        )

    return metadata


def classify_attachments(all_attachments: List[Dict]) -> None:
    """Mutates each attachment dict in place, setting is_likely_logo and
    classification_reason. This is the ONLY place this decision is made -
    the Node controller just trusts the result.

    Signal priority:
      1. Not an image, or an image with disposition == "attachment"
         (i.e. not inline) -> never a logo. A real explicit attachment
         is never reclassified as a template asset no matter what it
         looks like.
      2. PRIMARY: an inline image whose exact content_hash appears more
         than once across the whole thread -> it's the same bytes
         embedded in every message, which is exactly what a mail
         client's template logo/signature image does. A genuine
         one-off attachment doesn't duplicate itself byte-for-byte
         across every reply.
      3. FALLBACK (only when the hash appears exactly once, so there's
         nothing to compare against): filename convention or cid-in-html
         reference, AND small pixel dimensions. Any one signal alone is
         not enough - e.g. a cropped screenshot can be small, and a
         real photo can coincidentally be named image001.jpg.
    """
    hash_counts = Counter(a["content_hash"] for a in all_attachments)

    for a in all_attachments:
        is_image = a["content_type"].lower().startswith("image/")
        is_inline = a["disposition"] == "inline"

        if not is_image or not is_inline:
            a["is_likely_logo"] = False
            a["classification_reason"] = "not an inline image"
            continue

        if hash_counts[a["content_hash"]] > 1:
            a["is_likely_logo"] = True
            a["classification_reason"] = (
                f"identical bytes appear {hash_counts[a['content_hash']]} times across the thread "
                "(recurring template logo/signature, not a one-off upload)"
            )
            continue

        # Only reached when this exact image appears once in the thread.
        name_suggests_logo = _looks_like_logo_filename(a["filename"])
        referenced_as_signature = a["referenced_by_cid_in_own_message"]

        if not name_suggests_logo and not referenced_as_signature:
            a["is_likely_logo"] = False
            a["classification_reason"] = "appears once, no filename/cid signal suggesting a logo"
            continue

        w, h = a["width"], a["height"]
        is_small = w > 0 and h > 0 and w <= LOGO_MAX_DIMENSION_PX and h <= LOGO_MAX_DIMENSION_PX

        if not is_small:
            a["is_likely_logo"] = False
            a["classification_reason"] = "appears once, matched filename/cid signal but dimensions too large to be a logo"
            continue

        a["is_likely_logo"] = True
        a["classification_reason"] = (
            "appears once; inline, "
            + ("filename matches logo/signature convention" if name_suggests_logo else "referenced as cid: in its own message HTML")
            + f", small dimensions ({w}x{h})"
        )


def collect_nodes_from_eml(eml_path: str, attachments_dir: Path) -> Tuple[List[EmailNode], List[Dict]]:
    eml_path_obj = Path(eml_path)

    size = eml_path_obj.stat().st_size
    if size > MAX_EML_SIZE_BYTES:
        raise ValueError(
            f"EML file is {size} bytes, exceeding the {MAX_EML_SIZE_BYTES} byte safety limit. "
            "Refusing to load fully into memory."
        )

    with eml_path_obj.open("rb") as f:
        root = BytesParser(policy=policy.default).parse(f)

    nodes: List[EmailNode] = []
    all_attachments: List[Dict] = []

    root_uid = f"root:{uuid.uuid4().hex}"
    root_node = _message_to_node(root, root_uid, "root", None)

    root_attachments_meta = _collect_attachments(root, attachments_dir, root_node.body_html)
    all_attachments.extend(root_attachments_meta)
    root_node.attachments_filenames = [a["filename"] for a in root_attachments_meta]
    root_node.attachments = root_attachments_meta

    nodes.append(root_node)

    embedded_count = 0
    for part in root.walk():
        if part.get_content_type() == "message/rfc822":
            payload = part.get_payload()
            if isinstance(payload, list) and payload:
                for sub_msg in payload:
                    if isinstance(sub_msg, Message):
                        embedded_count += 1
                        uid = f"embedded:{embedded_count}"
                        node = _message_to_node(sub_msg, uid, "embedded", root_uid)

                        embedded_attachments_meta = _collect_attachments(sub_msg, attachments_dir, node.body_html)
                        all_attachments.extend(embedded_attachments_meta)
                        node.attachments_filenames = [a["filename"] for a in embedded_attachments_meta]
                        node.attachments = embedded_attachments_meta

                        nodes.append(node)

    # Now that every attachment across the whole thread is known,
    # classify them. This is what makes the duplicate-hash signal
    # possible - it needs the full set, not a single message's worth.
    classify_attachments(all_attachments)

    # Attachments (if any) are now on disk, not in RAM. Encourage the
    # interpreter to reclaim the parsed MIME tree promptly rather than
    # waiting for the next collection cycle, since `root` can be large.
    gc.collect()

    return nodes, all_attachments


def build_thread_tree(nodes: List[EmailNode]) -> Dict:
    parent: Dict[str, Optional[str]] = {n.uid: None for n in nodes}
    children: Dict[str, List[str]] = {n.uid: [] for n in nodes}

    msgid_to_uid: Dict[str, str] = {}
    for n in nodes:
        if n.message_id and n.message_id not in msgid_to_uid:
            msgid_to_uid[n.message_id] = n.uid

    for n in nodes:
        p: Optional[str] = None
        for mid in n.in_reply_to:
            if mid in msgid_to_uid:
                p = msgid_to_uid[mid]
                break

        if p is None and n.references:
            for mid in reversed(n.references):
                if mid in msgid_to_uid:
                    p = msgid_to_uid[mid]
                    break

        if p is None and n.containment_parent_uid:
            p = n.containment_parent_uid

        if p == n.uid:
            p = None
        parent[n.uid] = p

    for uid, p in parent.items():
        if p is not None and p in children:
            children[p].append(uid)

    roots = [uid for uid, p in parent.items() if p is None]

    def dfs(u: str, acc: List[str]) -> List[List[str]]:
        ch = children.get(u, [])
        if not ch:
            return [acc + [u]]
        paths = []
        for v in ch:
            paths.extend(dfs(v, acc + [u]))
        return paths

    branch_paths = []
    for r in roots:
        branch_paths.extend(dfs(r, []))

    return {
        "roots": roots,
        "parent": parent,
        "children": children,
        "branch_paths": branch_paths,
    }


def extract_eml_to_json(eml_path: str, attachments_dir: str) -> Dict:
    out_dir = Path(attachments_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    nodes, all_attachments = collect_nodes_from_eml(eml_path, out_dir)
    thread_tree = build_thread_tree(nodes)

    emails_dict = []
    for node in nodes:
        node_dict = asdict(node)
        node_dict["from"] = node_dict.pop("from_")
        emails_dict.append(node_dict)

    dropped = [a for a in all_attachments if a["is_likely_logo"]]
    kept = [a for a in all_attachments if not a["is_likely_logo"]]

    return {
        "attachments": all_attachments,
        "attachments_dir": str(out_dir),
        "emails": emails_dict,
        "thread_tree": thread_tree,
        "summary": {
            "total_messages": len(nodes),
            "total_attachments": len(all_attachments),
            "total_attachments_kept": len(kept),
            "total_attachments_dropped_as_logo": len(dropped),
            "attachments_by_disposition": {
                "attachment": sum(1 for a in all_attachments if a["disposition"] == "attachment"),
                "inline": sum(1 for a in all_attachments if a["disposition"] == "inline"),
            },
            "thread_roots": len(thread_tree["roots"]),
            "thread_branches": len(thread_tree["branch_paths"]),
        },
    }


def main():
    if len(sys.argv) < 2:
        print("Usage: python eml_extractor.py <eml_file_path> [attachments_output_dir]", file=sys.stderr)
        sys.exit(1)

    eml_file_path = sys.argv[1]
    attachments_dir = sys.argv[2] if len(sys.argv) > 2 else tempfile.mkdtemp(prefix="eml_att_")

    if not os.path.exists(eml_file_path):
        print(f"Error: File {eml_file_path} does not exist", file=sys.stderr)
        sys.exit(1)

    try:
        result = extract_eml_to_json(eml_file_path, attachments_dir)
        # Only the (now small, attachment-free) JSON goes over stdout.
        print(json.dumps(result))
    except Exception as e:
        print(f"Error extracting EML: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()