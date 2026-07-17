#!/usr/bin/env python3
"""
EML Extractor with JSON output for Node.js integration.
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

MAX_EML_SIZE_BYTES = int(os.environ.get("EML_MAX_SIZE_BYTES", 200 * 1024 * 1024))  # 200MB
LOGO_MAX_DIMENSION_PX = int(os.environ.get("LOGO_MAX_DIMENSION_PX", 300))
LOGO_FILENAME_PATTERN = re.compile(r"^(image\d{3,}|logo|signature|banner|spacer|icon)\b", re.IGNORECASE)


def safe_filename(name: str) -> str:
    name = (name or "").strip().replace("\x00", "")
    name = name.replace("\\", "").replace("/", "")
    name = re.sub(r"[\r\n\t]", " ", name)
    name = re.sub(r'[:*?"<>|]', "", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name or "file"


def _clean_body_urls(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"mailto:[^\s>]+>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<https?://[^>]+>", "", text, flags=re.IGNORECASE)
    return text.strip()


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
    if not HAS_PIL:
        return (0, 0)
    try:
        with Image.open(file_path) as img:
            return img.size 
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
    metadata: List[Dict] = []

    for part in msg.walk():
        if part.is_multipart():
            continue

        filename = part.get_filename()
        if not filename:
            continue

        raw_disposition = (part.get_content_disposition() or "").lower()
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
                "is_likely_logo": False,
                "classification_reason": None,
            }
        )

    return metadata


def classify_attachments(all_attachments: List[Dict]) -> None:
    hash_counts = Counter(a["content_hash"] for a in all_attachments)

    for a in all_attachments:
        is_image = a["content_type"].lower().startswith("image/")
        if not is_image:
            a["is_likely_logo"] = False
            a["classification_reason"] = "not an image"
            continue

        is_referenced_in_html = a["referenced_by_cid_in_own_message"]
        is_explicit_inline = a["disposition"] == "inline"

        # 1. Genuine File Attachments
        # If an image is neither explicitly marked inline nor embedded in the body HTML, it's a real file upload.
        if not is_referenced_in_html and not is_explicit_inline:
            # Exception: If the headers are stripped but it perfectly matches a logo name AND appears repeatedly
            if hash_counts[a["content_hash"]] > 1 and _looks_like_logo_filename(a["filename"]):
                a["is_likely_logo"] = True
                a["classification_reason"] = "no inline headers, but filename and thread duplication confirm signature logo"
            else:
                a["is_likely_logo"] = False
                a["classification_reason"] = "standard file attachment (not inline, not embedded via cid)"
            continue

        # 2. Thread Duplication (The ultimate signature logo signal)
        if hash_counts[a["content_hash"]] > 1:
            a["is_likely_logo"] = True
            a["classification_reason"] = (
                f"identical bytes appear {hash_counts[a['content_hash']]} times across the thread "
                "(recurring template logo/signature)"
            )
            continue

        # 3. Single-Message Embedded Images
        name_suggests_logo = _looks_like_logo_filename(a["filename"])
        w, h = a["width"], a["height"]
        is_small = (w > 0 and h > 0 and w <= LOGO_MAX_DIMENSION_PX and h <= LOGO_MAX_DIMENSION_PX)

        if is_small and (name_suggests_logo or is_referenced_in_html):
            a["is_likely_logo"] = True
            a["classification_reason"] = f"appears once; small dimensions ({w}x{h}), embedded/named as logo"
        elif name_suggests_logo and is_referenced_in_html:
            a["is_likely_logo"] = True
            a["classification_reason"] = f"appears once; larger dimensions ({w}x{h}) but explicitly named and embedded as a logo"
        else:
            # It's an inline image, but it's large and lacks a logo name (e.g., a genuine inline screenshot)
            a["is_likely_logo"] = False
            a["classification_reason"] = f"appears once; dimensions ({w}x{h}) suggest genuine inline screenshot/photo"


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

    classify_attachments(all_attachments)

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
        print(json.dumps(result))
    except Exception as e:
        print(f"Error extracting EML: {str(e)}", file=sys.stderr)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()