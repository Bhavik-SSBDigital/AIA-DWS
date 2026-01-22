#!/usr/bin/env python3
"""
EML Extractor with JSON output for Node.js integration
"""
import json
import mimetypes
import os
import re
import sys
import base64
from dataclasses import dataclass, asdict
from email import policy
from email.message import Message
from email.parser import BytesParser
from pathlib import Path
from typing import Dict, List, Optional, Tuple


# -----------------------------
# File helpers
# -----------------------------
def _safe_filename(name: str) -> str:
    name = (name or "").strip().replace("\x00", "")
    name = name.replace("\\", "_").replace("/", "_")
    name = re.sub(r"[\r\n\t]", " ", name)
    name = re.sub(r'[:*?"<>|]', "_", name)
    name = re.sub(r"\s+", " ", name).strip()
    return name or "file"


# -----------------------------
# Email body extraction
# -----------------------------
def _html_to_text_basic(html: str) -> str:
    """Simple HTML -> text."""
    if not html:
        return ""
    html = re.sub(r"(?is)<(script|style).*?>.*?</\1>", "", html)
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
    return text.strip()


def _get_body_text(msg: Message) -> str:
    """Extract body text from email."""
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
        return "\n\n".join(plain_parts).strip()
    if html_parts:
        return _html_to_text_basic("\n\n".join(html_parts))
    return ""


def _get_body_html(msg: Message) -> str:
    """Extract HTML body from email."""
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
# Message ID extraction
# -----------------------------
def _extract_msg_ids(header_val: str) -> List[str]:
    """Extract RFC-like message IDs."""
    if not header_val:
        return []
    ids = re.findall(r"<[^>]+>", header_val)
    return [i.strip() for i in ids if i.strip()]


# -----------------------------
# Thread parsing
# -----------------------------
def _safe_text(s: Optional[str]) -> str:
    return (s or "").strip()


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
    """Convert email Message object to EmailNode with all details."""
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


def _collect_attachments(msg: Message) -> Tuple[List[Dict], List[Dict]]:
    """
    Collect all attachments from a message.
    Returns: (attachments_with_content, attachments_metadata)
    """
    attachments_with_content = []
    attachments_metadata = []
    
    for part in msg.walk():
        if part.is_multipart():
            continue

        filename = part.get_filename()
        if not filename:
            continue

        disposition = (part.get_content_disposition() or "").lower()
        if disposition not in ["attachment", "inline"]:
            continue

        payload = part.get_payload(decode=True)
        if payload is None:
            continue

        content_type = part.get_content_type() or "application/octet-stream"
        
        # Create metadata entry
        metadata = {
            "filename": filename,
            "size": len(payload),
            "content_type": content_type,
            "disposition": disposition
        }
        attachments_metadata.append(metadata)
        
        # Create full attachment entry with base64 content
        attachment_full = {
            "filename": filename,
            "content_type": content_type,
            "base64_content": base64.b64encode(payload).decode('utf-8'),
            "size": len(payload),
            "disposition": disposition,
            "associated_email_subject": _safe_text(msg.get("Subject")),
            "associated_email_from": _safe_text(msg.get("From"))
        }
        attachments_with_content.append(attachment_full)
    
    return attachments_with_content, attachments_metadata


def collect_nodes_from_eml(eml_path: str | os.PathLike) -> Tuple[List[EmailNode], List[Dict]]:
    """
    Collect all messages and attachments from EML file.
    Returns: (nodes, all_attachments)
    """
    eml_path = Path(eml_path)
    with eml_path.open("rb") as f:
        root = BytesParser(policy=policy.default).parse(f)

    nodes: List[EmailNode] = []
    all_attachments: List[Dict] = []
    
    # Process root message
    root_uid = f"root:{hash(str(eml_path))}"
    root_node = _message_to_node(root, root_uid, "root", None)
    
    # Get root attachments
    root_attachments, root_attachments_meta = _collect_attachments(root)
    all_attachments.extend(root_attachments)
    root_node.attachments_filenames = [a["filename"] for a in root_attachments_meta]
    root_node.attachments = root_attachments_meta
    
    nodes.append(root_node)

    # Look for embedded messages (message/rfc822 parts)
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
                        
                        # Get attachments from embedded message
                        embedded_attachments, embedded_attachments_meta = _collect_attachments(sub_msg)
                        all_attachments.extend(embedded_attachments)
                        node.attachments_filenames = [a["filename"] for a in embedded_attachments_meta]
                        node.attachments = embedded_attachments_meta
                        
                        nodes.append(node)
    
    return nodes, all_attachments


def _build_thread_text(nodes: List[EmailNode]) -> str:
    """Build a formatted thread text from all messages."""
    thread_lines = []
    
    for i, node in enumerate(nodes, 1):
        thread_lines.append("=" * 80)
        thread_lines.append(f"MESSAGE {i} ({node.source.upper()})")
        thread_lines.append("=" * 80)
        thread_lines.append(f"Subject: {node.subject}")
        thread_lines.append(f"From: {node.from_}")
        thread_lines.append(f"To: {node.to}")
        if node.cc:
            thread_lines.append(f"Cc: {node.cc}")
        if node.bcc:
            thread_lines.append(f"Bcc: {node.bcc}")
        thread_lines.append(f"Date: {node.date}")
        thread_lines.append(f"Message-ID: {node.message_id}")
        
        if node.attachments_filenames:
            thread_lines.append(f"Attachments: {', '.join(node.attachments_filenames)}")
        
        thread_lines.append("-" * 80)
        thread_lines.append(node.body_text)
        thread_lines.append("\n")
    
    return "\n".join(thread_lines)


def build_thread_tree(nodes: List[EmailNode]) -> Dict:
    """Build thread tree structure."""
    parent: Dict[str, Optional[str]] = {n.uid: None for n in nodes}
    children: Dict[str, List[str]] = {n.uid: [] for n in nodes}
    
    # Map Message-ID -> uid
    msgid_to_uid: Dict[str, str] = {}
    for n in nodes:
        if n.message_id and n.message_id not in msgid_to_uid:
            msgid_to_uid[n.message_id] = n.uid
    
    # Build parent-child relationships
    for n in nodes:
        p: Optional[str] = None
        
        # 1) In-Reply-To
        for mid in n.in_reply_to:
            if mid in msgid_to_uid:
                p = msgid_to_uid[mid]
                break
        
        # 2) References (last match wins)
        if p is None and n.references:
            for mid in reversed(n.references):
                if mid in msgid_to_uid:
                    p = msgid_to_uid[mid]
                    break
        
        # 3) Containment fallback
        if p is None and n.containment_parent_uid:
            p = n.containment_parent_uid
        
        if p == n.uid:
            p = None
        parent[n.uid] = p
    
    # Build children adjacency
    for uid, p in parent.items():
        if p is not None and p in children:
            children[p].append(uid)
    
    # Find roots
    roots = [uid for uid, p in parent.items() if p is None]
    
    # Find branch paths
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
        "branch_paths": branch_paths
    }


# -----------------------------
# Main extraction function
# -----------------------------
def extract_eml_to_json(eml_path: str) -> Dict:
    """Main function to extract EML and return JSON."""
    nodes, all_attachments = collect_nodes_from_eml(eml_path)
    thread_tree = build_thread_tree(nodes)
    thread_text = _build_thread_text(nodes)
    
    # Convert nodes to dict format
    emails_dict = []
    for node in nodes:
        node_dict = asdict(node)
        # Remove the underscore from 'from_' for JSON compatibility
        node_dict["from"] = node_dict.pop("from_")
        emails_dict.append(node_dict)
    
    return {
        "thread_text": thread_text,
        "attachments": all_attachments,
        "emails": emails_dict,
        "thread_tree": thread_tree,
        "summary": {
            "total_messages": len(nodes),
            "total_attachments": len(all_attachments),
            "thread_roots": len(thread_tree["roots"]),
            "thread_branches": len(thread_tree["branch_paths"])
        }
    }


# -----------------------------
# Main execution
# -----------------------------
def main():
    if len(sys.argv) != 2:
        print("Usage: python eml_extractor_v2.py <eml_file_path>")
        sys.exit(1)
    
    eml_file_path = sys.argv[1]
    
    if not os.path.exists(eml_file_path):
        print(f"Error: File {eml_file_path} does not exist")
        sys.exit(1)
    
    try:
        result = extract_eml_to_json(eml_file_path)
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(f"Error extracting EML: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()