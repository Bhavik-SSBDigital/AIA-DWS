import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getPersonalizedDashboard, ViewDocument } from "../../common/Apis";
import apiClient from "../../common/Apis";
import ViewFile from "../view/View";
import TopLoader from "../../common/Loader/TopLoader";

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const fmt = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const timeAgo = (d) => {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const h = Math.floor(diff / 36e5);
  if (h < 1) return "Just now";
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  return fmt(d);
};

const SC = { COMPLETED: "#16a34a", IN_PROGRESS: "#2563eb", PENDING: "#d97706", REJECTED: "#dc2626", PO_NO_ATTACHED: "#7c3aed" };
const statusColor = (s) => SC[s] || "#6b7280";
const statusLabel = (s) => ({ COMPLETED: "Completed", IN_PROGRESS: "In Progress", PENDING: "Pending", REJECTED: "Rejected", PO_NO_ATTACHED: "PO Attached" }[s] || s);

// ─── SHARED UI ELEMENTS ───────────────────────────────────────────────────────
const Pill = ({ label, color = "#2563eb" }) => (
  <span style={{ background: color + "12", color, border: `1px solid ${color}20`, borderRadius: 6, fontSize: 10, fontWeight: 700, padding: "3px 8px", whiteSpace: "nowrap", letterSpacing: "0.03em", display: "inline-block" }}>
    {label}
  </span>
);

const Avatar = ({ name = "?", size = 26 }) => {
  const safeName = typeof name === "string" ? name : "?";
  const initials = safeName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const hue = safeName.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `hsl(${hue}, 65%, 90%)`, color: `hsl(${hue}, 70%, 35%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4, fontWeight: 800, flexShrink: 0, boxShadow: `inset 0 0 0 1px hsl(${hue}, 60%, 80%)` }}>
      {initials}
    </div>
  );
};

const KpiCard = ({ icon, label, value, sub, color = "#2563eb", onClick, alert: hasAlert }) => (
  <div
    onClick={onClick}
    style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, padding: "20px", cursor: onClick ? "pointer" : "default", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", position: "relative", overflow: "hidden", boxShadow: "0 2px 4px rgba(0,0,0,0.02)", display: "flex", flexDirection: "column" }}
    onMouseEnter={(e) => { if (onClick) { e.currentTarget.style.boxShadow = `0 12px 24px -8px ${color}35`; e.currentTarget.style.borderColor = color + "50"; e.currentTarget.style.transform = "translateY(-4px)"; } }}
    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.02)"; e.currentTarget.style.borderColor = "#e2e8f0"; e.currentTarget.style.transform = "translateY(0)"; }}
  >
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${color}, ${color}40)` }} />
    {hasAlert && <div style={{ position: "absolute", top: 12, right: 12, width: 8, height: 8, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 0 4px #ef444425" }} />}
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: color + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, color: color }}>{icon}</div>
      <span style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", wordBreak: "break-word" }}>{label}</span>
    </div>
    <div style={{ fontSize: 32, fontWeight: 900, color: "#0f172a", lineHeight: 1, letterSpacing: "-0.03em" }}>{value ?? "—"}</div>
    {sub && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 6, fontWeight: 500 }}>{sub}</div>}
    {onClick && <div style={{ position: "absolute", bottom: 16, right: 16, fontSize: 10, color, fontWeight: 800, opacity: 0.8, letterSpacing: "0.05em" }}>DRILL DOWN →</div>}
  </div>
);

const Card = ({ children, style = {} }) => (
  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 16, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03)", overflow: "hidden", ...style }}>
    {children}
  </div>
);

const CardHead = ({ title, count, onAction, actionLabel = "See all" }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #f1f5f9", flexWrap: "wrap", gap: 8 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 15, fontWeight: 800, color: "#0f172a" }}>{title}</span>
      {count !== undefined && count !== null && <span style={{ background: "#f1f5f9", color: "#475569", borderRadius: 20, fontSize: 12, fontWeight: 700, padding: "2px 10px" }}>{count}</span>}
    </div>
    {onAction && (
      <button onClick={onAction} style={{ fontSize: 12, color: "#2563eb", fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: "4px 8px", borderRadius: 6, transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "#eff6ff"} onMouseLeave={(e) => e.currentTarget.style.background = "none"}>
        {actionLabel} →
      </button>
    )}
  </div>
);

const Pagination = ({ page, total, perPage, onChange }) => {
  const safeTotal = total || 0;
  const totalPages = Math.ceil(safeTotal / perPage);
  if (totalPages <= 1) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", flexWrap: "wrap", gap: 8 }}>
      <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>
        {(page - 1) * perPage + 1} – {Math.min(page * perPage, safeTotal)} of {safeTotal}
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        <button disabled={page <= 1} onClick={() => onChange(page - 1)} style={{ background: page <= 1 ? "#f1f5f9" : "#fff", border: "1px solid #cbd5e1", borderRadius: 8, width: 30, height: 30, cursor: page <= 1 ? "default" : "pointer", fontSize: 14, color: page <= 1 ? "#94a3b8" : "#334155", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>‹</button>
        {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
          let p = i + 1;
          if (totalPages > 5) {
            if (page <= 3) p = i + 1;
            else if (page >= totalPages - 2) p = totalPages - 4 + i;
            else p = page - 2 + i;
          }
          return (
            <button key={p} onClick={() => onChange(p)} style={{ background: p === page ? "#2563eb" : "#fff", border: `1px solid ${p === page ? "#2563eb" : "#cbd5e1"}`, borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 12, fontWeight: 700, color: p === page ? "#fff" : "#334155", transition: "all 0.2s", boxShadow: p === page ? "0 2px 4px rgba(37,99,235,0.2)" : "none" }}>{p}</button>
          );
        })}
        <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} style={{ background: page >= totalPages ? "#f1f5f9" : "#fff", border: "1px solid #cbd5e1", borderRadius: 8, width: 30, height: 30, cursor: page >= totalPages ? "default" : "pointer", fontSize: 14, color: page >= totalPages ? "#94a3b8" : "#334155", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>›</button>
      </div>
    </div>
  );
};

// ─── LIST ITEMS ───────────────────────────────────────────────────────────────
const ProcessItem = ({ item, onView, onViewDoc }) => {
  const [expanded, setExpanded] = useState(false);
  const safeTags = item.tags || [];
  const safeDocs = item.documents || [];
  
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, marginBottom: 10, background: "#fff", overflow: "hidden", transition: "box-shadow 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }} onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.05)"} onMouseLeave={(e) => e.currentTarget.style.boxShadow = "0 1px 2px rgba(0,0,0,0.02)"}>
      <div style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flex: 1, minWidth: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(item.status || "IN_PROGRESS"), marginTop: 6, flexShrink: 0, boxShadow: `0 0 0 3px ${statusColor(item.status || "IN_PROGRESS")}20` }} />
            <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a", wordBreak: "break-word", lineHeight: 1.4 }}>{item.processName || item.name || "Untitled"}</div>
          </div>
          <button onClick={() => onView && onView(item)} style={{ background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, transition: "all 0.2s" }} onMouseEnter={(e) => { e.currentTarget.style.background = "#2563eb"; e.currentTarget.style.color = "#fff"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.color = "#2563eb"; }}>Open →</button>
        </div>
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 8 }}>
            {item.workflowName && <Pill label={item.workflowName} color="#6366f1" />}
            {item.stepName && <Pill label={`Step ${item.stepNumber ?? ""}: ${item.stepName}`} color="#0891b2" />}
            {item.status && <Pill label={statusLabel(item.status)} color={statusColor(item.status)} />}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            {item.initiatorName && (
              <div style={{ fontSize: 12, color: "#64748b", display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
                <Avatar name={item.initiatorName} size={18} /> {item.initiatorName} <span style={{ color: "#cbd5e1" }}>|</span> {fmt(item.createdAt)}
              </div>
            )}
            {item.issueNo && <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500, background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>#{item.issueNo}</span>}
          </div>
          {safeTags.length > 0 && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {safeTags.slice(0, 3).map((t, i) => <Pill key={i} label={t} color="#8b5cf6" />)}
            </div>
          )}
        </div>
        {safeDocs.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <button onClick={() => setExpanded(!expanded)} style={{ background: expanded ? "#f1f5f9" : "transparent", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 8, padding: "5px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, transition: "all 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "#f1f5f9"} onMouseLeave={(e) => e.currentTarget.style.background = expanded ? "#f1f5f9" : "transparent"}>
              <span style={{ transform: expanded ? "rotate(-180deg)" : "rotate(0deg)", transition: "transform 0.3s ease", display: "inline-block", fontSize: 10 }}>▼</span> Documents ({safeDocs.length})
            </button>
          </div>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateRows: expanded ? "1fr" : "0fr", transition: "grid-template-rows 0.3s cubic-bezier(0.4, 0, 0.2, 1)" }}>
        <div style={{ overflow: "hidden" }}>
          <div style={{ borderTop: expanded ? "1px solid #f1f5f9" : "0px solid transparent", background: "#f8fafc", padding: expanded ? "10px 16px 14px" : "0px 16px", opacity: expanded ? 1 : 0, transition: "all 0.3s ease-in-out" }}>
            {safeDocs.map((doc, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "#fff", borderRadius: 8, marginBottom: 8, border: "1px solid #e2e8f0", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "#1e293b", marginBottom: 4, wordBreak: "break-word" }}>📄 {doc.name || "Document"}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Pill label={doc.type?.toUpperCase() || "FILE"} color="#64748b" />
                    {(doc.signedBy || []).length > 0 && <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 700, background: "#f0fdf4", padding: "2px 6px", borderRadius: 4 }}>✓ {(doc.signedBy || []).join(", ")}</span>}
                    {doc.rejected && <Pill label="Rejected" color="#ef4444" />}
                  </div>
                </div>
                {onViewDoc && <button onClick={() => onViewDoc(doc)} style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer", flexShrink: 0, transition: "all 0.2s" }} onMouseEnter={(e) => { e.currentTarget.style.background = "#16a34a"; e.currentTarget.style.color = "#fff"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "#f0fdf4"; e.currentTarget.style.color = "#16a34a"; }}>View</button>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const SignedDocItem = ({ item, onViewProcess, onViewDoc }) => (
  <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, marginBottom: 10, background: "#fff", overflow: "hidden", padding: "14px 16px", transition: "box-shadow 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.05)"} onMouseLeave={(e) => e.currentTarget.style.boxShadow = "none"}>
    <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a", wordBreak: "break-word", marginBottom: 8 }}>📄 {item.documentName || "Document"}</div>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
      <Pill label={item.documentType?.toUpperCase() || "FILE"} color="#64748b" />
      <Pill label={statusLabel(item.processStatus)} color={statusColor(item.processStatus)} />
      {item.byRecommender && <Pill label="As Recommender" color="#8b5cf6" />}
    </div>
    <div style={{ fontSize: 12, color: "#475569", marginBottom: 4, fontWeight: 500 }}>🔗 <strong style={{ color: "#0f172a" }}>{item.processName || "Process"}</strong> · {item.workflowName || "Workflow"}</div>
    <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: item.reason ? 8 : 0, fontWeight: 500 }}>Signed {timeAgo(item.signedAt)} · {fmt(item.signedAt)}</div>
    {item.reason && <div style={{ fontSize: 12, color: "#334155", fontStyle: "italic", background: "#f8fafc", padding: "6px 10px", borderRadius: 8, borderLeft: "3px solid #cbd5e1", marginBottom: 6 }}>"{item.reason}"</div>}
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
      <button onClick={() => onViewProcess(item.processId)} style={{ flex: 1, background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 8, padding: "7px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.2s" }} onMouseEnter={(e) => { e.currentTarget.style.background = "#2563eb"; e.currentTarget.style.color = "#fff"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.color = "#2563eb"; }}>Open Process</button>
      {onViewDoc && item.documentName && <button onClick={() => onViewDoc(item)} style={{ flex: 1, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 8, padding: "7px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.2s" }} onMouseEnter={(e) => { e.currentTarget.style.background = "#16a34a"; e.currentTarget.style.color = "#fff"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "#f0fdf4"; e.currentTarget.style.color = "#16a34a"; }}>View Document</button>}
    </div>
  </div>
);

const CompletedItem = ({ item, onViewProcess }) => (
  <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, marginBottom: 10, background: "#fff", padding: "14px 16px", transition: "box-shadow 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.05)"} onMouseLeave={(e) => e.currentTarget.style.boxShadow = "none"}>
    <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a", marginBottom: 8, display: "flex", alignItems: "flex-start", gap: 8 }}>
      <span style={{ fontSize: 16 }}>✅</span> <span>{item.processName || "Process"}</span>
    </div>
    <div style={{ fontSize: 12, color: "#475569", marginBottom: 6, fontWeight: 500 }}>
      {item.workflowName || "Workflow"} · Step {item.stepNumber || "-"}: {item.stepName || "Unnamed"}
    </div>
    <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12, fontWeight: 500 }}>
      Approved: {fmt(item.decisionAt || item.createdAt)}
    </div>
    <button onClick={() => onViewProcess(item.processId || item.id, false)} style={{ width: "100%", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 8, padding: "7px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", transition: "all 0.2s" }} onMouseEnter={(e) => { e.currentTarget.style.background = "#2563eb"; e.currentTarget.style.color = "#fff"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.color = "#2563eb"; }}>Open Process →</button>
  </div>
);

const QueryItem = ({ item, onViewProcess }) => (
  <div style={{ border: `1px solid ${item.status === "OPEN" ? "#fde68a" : "#e2e8f0"}`, borderRadius: 12, marginBottom: 10, background: item.status === "OPEN" ? "#fffcf0" : "#fff", padding: "14px 16px", transition: "box-shadow 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.05)"} onMouseLeave={(e) => e.currentTarget.style.boxShadow = "none"}>
    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
      <Pill label={item.isRaiser ? "Raised by you" : "Assigned to you"} color={item.isRaiser ? "#d97706" : "#4f46e5"} />
      <Pill label={item.status === "OPEN" ? "Open" : "Resolved"} color={item.status === "OPEN" ? "#d97706" : "#16a34a"} />
    </div>
    <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a", marginBottom: 8 }}>{item.question || "No question provided"}</div>
    {item.answer && <div style={{ fontSize: 13, color: "#334155", background: "#f0fdf4", padding: "8px 12px", borderRadius: 8, borderLeft: "3px solid #16a34a", marginBottom: 10, fontWeight: 500 }}>✅ {item.answer}</div>}
    <div style={{ fontSize: 12, color: "#64748b", marginBottom: 12, fontWeight: 500 }}><strong style={{ color: "#0f172a" }}>{item.processName || "Process"}</strong> · {item.workflowName || "Workflow"} · {timeAgo(item.createdAt)}</div>
    <button onClick={() => onViewProcess(item.processId)} style={{ width: "100%", background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 8, padding: "7px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer", transition: "all 0.2s" }} onMouseEnter={(e) => { e.currentTarget.style.background = "#2563eb"; e.currentTarget.style.color = "#fff"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.color = "#2563eb"; }}>Open Process →</button>
  </div>
);

const WorkflowBar = ({ wf }) => {
  const barColor = wf.completionRate >= 80 ? "#16a34a" : wf.completionRate >= 50 ? "#2563eb" : "#d97706";
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0, paddingRight: 10 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{wf.name || "Workflow"}</div>
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginTop: 2 }}>v{wf.version || 1}</div>
        </div>
        <span style={{ fontSize: 20, fontWeight: 900, color: barColor, flexShrink: 0 }}>{wf.completionRate || 0}%</span>
      </div>
      <div style={{ height: 8, background: "#f1f5f9", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${wf.completionRate || 0}%`, background: barColor, borderRadius: 99, transition: "width 1s cubic-bezier(0.4, 0, 0.2, 1)" }} />
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}><span style={{ color: "#3b82f6" }}>●</span> {wf.active || 0} active</span>
        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}><span style={{ color: "#22c55e" }}>●</span> {wf.completed || 0} done</span>
        <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 600, marginLeft: "auto" }}>Total: {wf.total || 0}</span>
      </div>
    </div>
  );
};

const Empty = ({ icon, text }) => (
  <div style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8" }}>
    <div style={{ fontSize: 32, marginBottom: 12 }}>{icon}</div>
    <div style={{ fontSize: 14, fontWeight: 700 }}>{text}</div>
  </div>
);

// ─── DRAWERS AND PAGINATION CONTAINERS ────────────────────────────────────────
const Drawer = ({ open, onClose, title, subtitle, children }) => (
  <>
    {open && <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15, 23, 42, 0.4)", zIndex: 1200, backdropFilter: "blur(4px)", transition: "opacity 0.3s" }} />}
    <div className={`drawer-panel ${open ? 'open' : ''}`} style={{ position: "fixed", top: 0, right: 0, bottom: 0, background: "#f8fafc", zIndex: 1201, boxShadow: "-12px 0 48px rgba(0,0,0,0.15)", transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #e2e8f0", flexShrink: 0, background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ paddingRight: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: "#0f172a", wordBreak: "break-word" }}>{title}</h3>
          {subtitle && <p style={{ margin: "4px 0 0", fontSize: 13, color: "#64748b", fontWeight: 500 }}>{subtitle}</p>}
        </div>
        <button onClick={onClose} style={{ background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 10, width: 32, height: 32, cursor: "pointer", fontSize: 18, color: "#475569", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "#e2e8f0"} onMouseLeave={(e) => e.currentTarget.style.background = "#f1f5f9"}>×</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>{children}</div>
    </div>
  </>
);

const PER_PAGE_DRAWER = 10;
const DrawerList = ({ data = [], type, onViewProcess, onViewDoc, page, total, onPageChange }) => {
  const safeData = data || [];
  return (
    <>
      {safeData.map((item) =>
        type === "signed" ? <SignedDocItem key={item.id} item={item} onViewProcess={onViewProcess} onViewDoc={onViewDoc} />
          : type === "completed" ? <CompletedItem key={item.id} item={item} onViewProcess={onViewProcess} />
          : type === "queries" ? <QueryItem key={item.id} item={item} onViewProcess={onViewProcess} />
          : <ProcessItem key={item.id} item={item} onView={(it) => onViewProcess(it.processId || it.id, type === "pending")} onViewDoc={onViewDoc} />
      )}
      <Pagination page={page} total={total} perPage={PER_PAGE_DRAWER} onChange={onPageChange} />
    </>
  );
};

const PER_PAGE_CARD = 5;
const PaginatedCard = ({ title, count, items = [], onSeeAll, renderItem }) => {
  const [page, setPage] = useState(1);
  const safeItems = items || [];
  const slice = safeItems.slice((page - 1) * PER_PAGE_CARD, page * PER_PAGE_CARD);

  return (
    <Card style={{ display: "flex", flexDirection: "column" }}>
      <CardHead title={title} count={count} onAction={onSeeAll} actionLabel="View All" />
      <div style={{ padding: "16px", flex: 1, overflowY: "auto", maxHeight: 440, background: "#f8fafc" }}>
        {safeItems.length === 0 ? <Empty icon="📭" text="Nothing here yet" /> : slice.map((item, i) => renderItem(item, i))}
      </div>
      {safeItems.length > PER_PAGE_CARD && (
        <Pagination page={page} total={safeItems.length} perPage={PER_PAGE_CARD} onChange={setPage} />
      )}
    </Card>
  );
};

const RecentActivityList = ({ activity = [], onViewProcess }) => {
  const [actPage, setActPage] = useState(1);
  const safeActivity = activity || [];
  const slice = safeActivity.slice((actPage - 1) * PER_PAGE_CARD, actPage * PER_PAGE_CARD);

  return (
    <>
      <div style={{ padding: "12px 16px", maxHeight: 440, overflowY: "auto", background: "#f8fafc" }}>
        {slice.length === 0 ? <Empty icon="📭" text="No recent activity" /> : slice.map((a, i) => (
          <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 10px", borderBottom: i < slice.length - 1 ? "1px solid #e2e8f0" : "none", background: "#fff", borderRadius: i === slice.length - 1 ? 8 : 0, marginBottom: i < slice.length - 1 ? 0 : 8, transition: "background 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.background = "#f1f5f9"} onMouseLeave={(e) => e.currentTarget.style.background = "#fff"}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: statusColor(a.status) + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, marginTop: 2 }}>
              {a.status === "APPROVED" ? "✅" : a.status === "IN_PROGRESS" ? "🔄" : "📋"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.processName || "Process"}</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2, fontWeight: 500 }}>{a.workflowName || "Workflow"} · {a.stepName || "Step"}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <Pill label={statusLabel(a.status)} color={statusColor(a.status)} />
                <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 500 }}>{timeAgo(a.decisionAt || a.createdAt)}</span>
              </div>
            </div>
            <button onClick={() => onViewProcess(a.processId, false)} style={{ background: "none", border: "none", color: "#2563eb", fontSize: 11, fontWeight: 800, cursor: "pointer", flexShrink: 0, marginTop: 4, padding: "4px 8px", borderRadius: 6 }} onMouseEnter={(e) => e.currentTarget.style.background = "#eff6ff"} onMouseLeave={(e) => e.currentTarget.style.background = "none"}>Open →</button>
          </div>
        ))}
      </div>
      {safeActivity.length > PER_PAGE_CARD && <Pagination page={actPage} total={safeActivity.length} perPage={PER_PAGE_CARD} onChange={setActPage} />}
    </>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════
export default function PersonalizedDashboard() {
  const navigate = useNavigate();
  const [dashData, setDashData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionsLoading, setActionsLoading] = useState(false);
  const [drawer, setDrawer] = useState({ open: false, type: null, title: "", subtitle: "", drillData: [], total: 0, page: 1, drillLoading: false });
  const [fileView, setFileView] = useState(null);

  const today = new Date().toISOString().slice(0, 10);
  const defaultStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(today);

  const fetchAll = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const res = await getPersonalizedDashboard(startDate, endDate);
      if (res?.data?.data) {
        setDashData(res.data.data);
      } else {
        setDashData({}); 
      }
    } catch (e) {
      console.error(e);
      setDashData({}); 
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [startDate, endDate]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const goToProcess = (id, isPending = false) => {
    if (!id) return;
    navigate(isPending ? `/process/view/${id}` : `/process/view/${id}?adminView=true`);
  };

  const openDoc = async (doc) => {
    if (!doc) return;
    setActionsLoading(true);
    try {
      const name = doc.name || doc.documentName;
      const path = doc.path || doc.documentPath;
      const id = doc.id || doc.documentId;
      const ext = name ? name.split(".").pop().toLowerCase() : "pdf";
      if (!name || !path) return;
      const fileData = await ViewDocument(name, path, ext, id, false);
      setFileView(fileData);
    } catch (e) {
      console.error("Error opening doc", e);
    } finally {
      setActionsLoading(false);
    }
  };

  // ✅ Wire to your new backend endpoint
  const fetchDrawerData = async (type, title, subtitle, pageToFetch = 1) => {
    setDrawer((prev) => ({ ...prev, open: true, type, title, subtitle, drillLoading: true, page: pageToFetch }));
    
    const p = `startDate=${startDate}&endDate=${endDate}&page=${pageToFetch}&limit=${PER_PAGE_DRAWER}`;
    const urlMap = {
      pending: `/dashboard/pending-tasks?${p}`,
      initiated: `/dashboard/initiated-processes?${p}`,
      signed: `/dashboard/signed-documents?${p}`,
      queries: `/dashboard/open-queries?${p}`,
      completed: `/dashboard/completed-tasks?${p}`, // ✅ Directly requests your new endpoint
    };

    try {
      const res = await apiClient.get(urlMap[type]);
      setDrawer((prev) => ({ 
        ...prev, 
        drillData: res?.data?.data || [], 
        total: res?.data?.total || 0,
        drillLoading: false 
      }));
    } catch {
      setDrawer((prev) => ({ ...prev, drillLoading: false, drillData: [], total: 0 }));
    }
  };

  const closeDrawer = () => setDrawer({ open: false, type: null, title: "", subtitle: "", drillData: [], total: 0, page: 1, drillLoading: false });

  const d = dashData || {};
  const m = d.metrics || {};
  const profile = d.profile || {};

  const safePendingTasks = d.pendingTasks || [];
  const safeInitiatedProcesses = d.initiatedProcesses || [];
  const safeWorkflowStats = d.workflowStats || [];
  const safeSignedDocuments = d.signedDocuments || [];
  const safeOpenQueries = d.openQueries || [];
  const safeRecentActivity = d.recentActivity || [];

  const hasPendingTasks = (m.pendingTasks ?? 0) > 0 || safePendingTasks.length > 0;
  const hasInitiatedProcesses = (m.initiatedTotal ?? 0) > 0 || safeInitiatedProcesses.length > 0;
  const hasWorkflowStats = safeWorkflowStats.length > 0;
  const hasSignedDocs = (m.signedDocuments ?? 0) > 0 || safeSignedDocuments.length > 0;
  const hasOpenQueries = (m.openQueries ?? 0) > 0 || safeOpenQueries.length > 0;
  const hasRecentActivity = safeRecentActivity.length > 0;

  const completionTotal = m.initiatedTotal ?? 0;
  const completionDone = m.initiatedCompleted ?? 0;
  const completionRate = completionTotal > 0 ? Math.round((completionDone / completionTotal) * 100) : null;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", padding: "24px 5%" }}>
        <style>{`@keyframes shimmer{0%{opacity:.7}50%{opacity:.4}100%{opacity:.7}}`}</style>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} style={{ height: 120, background: "#e2e8f0", borderRadius: 16, animation: "shimmer 1.5s infinite" }} />)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
          {Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ height: 400, background: "#e2e8f0", borderRadius: 16, animation: "shimmer 1.5s infinite" }} />)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif", paddingBottom: 40 }}>
      
      {/* ─── RESPONSIVE CSS ─── */}
      <style>{`
        .dash-grid-kpi { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px; margin-bottom: 20px; }
        .dash-grid-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px; margin-bottom: 16px; }
        .drawer-panel { width: 560px; max-width: 95vw; transform: translateX(100%); }
        .drawer-panel.open { transform: translateX(0); }
        .flex-wrap-mobile { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
        .flex-col-mobile { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        
        @media (max-width: 1280px) {
          .dash-grid-kpi { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 640px) {
          .dash-grid-kpi { grid-template-columns: repeat(2, 1fr); gap: 12px; }
          .dash-grid-row { grid-template-columns: 1fr; gap: 12px; }
          .drawer-panel { width: 100vw; max-width: 100vw; }
          .flex-wrap-mobile { flex-direction: column; align-items: flex-start; }
          .flex-col-mobile { width: 100%; justify-content: space-between; }
        }
      `}</style>

      {actionsLoading && <TopLoader />}

      {/* ─── HEADER ─── */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "16px 24px", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto" }} className="flex-wrap-mobile">
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: "#0f172a", wordBreak: "break-word", letterSpacing: "-0.02em" }}>
              Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"},{" "}
              <span style={{ color: "#2563eb" }}>{profile?.name || profile?.username || "—"}</span>
            </h1>
            <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(profile?.roles || []).map((r) => <Pill key={r.id} label={r.name} color={r.isAdmin ? "#dc2626" : "#4f46e5"} />)}
              {(profile?.departments || []).map((dep) => <Pill key={dep.id} label={dep.name} color="#0891b2" />)}
            </div>
          </div>
          <div className="flex-col-mobile">
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 14px", flexWrap: "wrap", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.01)" }}>
              <input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} style={{ background: "none", border: "none", outline: "none", fontSize: 13, fontWeight: 700, color: "#334155", cursor: "pointer", maxWidth: "120px" }} />
              <span style={{ fontSize: 12, color: "#cbd5e1" }}>—</span>
              <input type="date" value={endDate} min={startDate} max={today} onChange={(e) => setEndDate(e.target.value)} style={{ background: "none", border: "none", outline: "none", fontSize: 13, fontWeight: 700, color: "#334155", cursor: "pointer", maxWidth: "120px" }} />
            </div>
            <button onClick={() => fetchAll(true)} disabled={refreshing} style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 800, cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.2s", boxShadow: "0 4px 6px -1px rgba(37,99,235,0.2)" }} onMouseEnter={(e) => { e.currentTarget.style.background = "#1d4ed8"; e.currentTarget.style.transform = "translateY(-1px)"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "#2563eb"; e.currentTarget.style.transform = "translateY(0)"; }}>
              {refreshing ? "Loading…" : "Apply Filters"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "24px 24px" }}>
        
        {/* ─── ROW 1: KPI GRID ─── */}
        <div className="dash-grid-kpi">
          <KpiCard icon="⏳" label="Pending Tasks" value={m.pendingTasks ?? 0} sub={m.overdueTasks > 0 ? `${m.overdueTasks} overdue` : "All current"} color="#d97706" alert={m.overdueTasks > 0} onClick={() => fetchDrawerData("pending", "Pending Tasks", `${m.pendingTasks || 0} tasks assigned to you`)} />
          <KpiCard icon="✅" label="Completed" value={m.completedTasks ?? 0} sub="Steps approved by you" color="#16a34a" onClick={() => fetchDrawerData("completed", "Completed Tasks", "Steps you have approved")} />
          <KpiCard icon="🚀" label="Initiated" value={m.initiatedTotal ?? 0} sub={`${m.initiatedActive ?? 0} active · ${m.initiatedCompleted ?? 0} done`} color="#2563eb" onClick={() => fetchDrawerData("initiated", "My Processes", "Processes you've initiated")} />
          <KpiCard icon="🖊" label="Docs Signed" value={m.signedDocuments ?? 0} sub="In date range" color="#8b5cf6" onClick={() => fetchDrawerData("signed", "Documents Signed", "All documents you've signed")} />
          <KpiCard icon="💬" label="Open Queries" value={m.openQueries ?? 0} sub="Raised or assigned to you" color="#ef4444" alert={(m.openQueries || 0) > 0} onClick={() => fetchDrawerData("queries", "Queries", "All queries involving you")} />
          <KpiCard icon="⚡" label="Avg Completion" value={m.avgCompletionHours ? `${m.avgCompletionHours}h` : "—"} sub={!m.avgCompletionHours ? "No data yet" : m.avgCompletionHours <= 24 ? "On track" : m.avgCompletionHours <= 48 ? "Moderate" : "Delayed"} color={!m.avgCompletionHours ? "#94a3b8" : m.avgCompletionHours <= 24 ? "#16a34a" : m.avgCompletionHours <= 48 ? "#d97706" : "#ef4444"} />
        </div>

        {/* ─── ROW 2: MAIN CARDS ─── */}
        <div className="dash-grid-row" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${hasInitiatedProcesses ? '320px' : '400px'}, 1fr))` }}>
          <PaginatedCard
            title="Pending Tasks"
            count={m.pendingTasks ?? 0}
            items={safePendingTasks}
            onSeeAll={() => fetchDrawerData("pending", "Pending Tasks")}
            renderItem={(item) => <ProcessItem key={item.id} item={item} onView={(it) => goToProcess(it.processId, true)} onViewDoc={openDoc} />}
          />
          {hasInitiatedProcesses && (
            <PaginatedCard
              title="My Processes"
              count={m.initiatedTotal ?? 0}
              items={safeInitiatedProcesses.map((p) => ({ ...p, processName: p.name }))}
              onSeeAll={() => fetchDrawerData("initiated", "My Processes")}
              renderItem={(item) => <ProcessItem key={item.id} item={item} onView={(it) => goToProcess(it.id, false)} onViewDoc={openDoc} />}
            />
          )}
          {hasWorkflowStats && (
            <Card>
              <CardHead title="Workflow Performance" />
              <div style={{ padding: "20px", maxHeight: 480, overflowY: "auto", background: "#f8fafc" }}>
                {safeWorkflowStats.map((wf) => <WorkflowBar key={wf.workflowId} wf={wf} />)}
              </div>
            </Card>
          )}
        </div>

        {/* ─── ROW 3: SECONDARY CARDS ─── */}
        {(hasSignedDocs || hasOpenQueries || hasRecentActivity) && (
          <div className="dash-grid-row" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(320px, 1fr))` }}>
            {hasSignedDocs && (
              <PaginatedCard title="Documents Signed" count={m.signedDocuments ?? 0} items={safeSignedDocuments} onSeeAll={() => fetchDrawerData("signed", "Documents Signed")} renderItem={(item) => <SignedDocItem key={item.id} item={item} onViewProcess={(id) => goToProcess(id, false)} onViewDoc={openDoc} />} />
            )}
            {hasOpenQueries && (
              <PaginatedCard title="Open Queries" count={m.openQueries ?? 0} items={safeOpenQueries} onSeeAll={() => fetchDrawerData("queries", "Queries")} renderItem={(item) => <QueryItem key={item.id} item={item} onViewProcess={(id) => goToProcess(id, false)} />} />
            )}
            {hasRecentActivity && (
              <Card>
                <CardHead title="Recent Activity" count={safeRecentActivity.length} />
                <RecentActivityList activity={safeRecentActivity} onViewProcess={goToProcess} />
              </Card>
            )}
          </div>
        )}

        {/* ─── ROW 4: TEAM STATS ─── */}
        {(completionRate !== null || d?.teamStats) && (
          <div className="dash-grid-row" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(320px, 1fr))` }}>
            {completionRate !== null && (
              <Card style={{ padding: "24px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>Process Completion Rate</div>
                    <div style={{ fontSize: 42, fontWeight: 900, color: "#0f172a", letterSpacing: "-0.03em" }}>
                      {completionRate}<span style={{ fontSize: 20, color: "#94a3b8" }}>%</span>
                    </div>
                    <div style={{ fontSize: 13, color: "#475569", marginTop: 6, fontWeight: 500 }}>
                      <strong style={{ color: "#0f172a" }}>{completionDone}</strong> completed out of <strong style={{ color: "#0f172a" }}>{completionTotal}</strong> initiated
                    </div>
                  </div>
                  <svg viewBox="0 0 36 36" style={{ width: 80, height: 80, transform: "rotate(-90deg)", flexShrink: 0, filter: "drop-shadow(0 4px 6px rgba(37,99,235,0.15))" }}>
                    <circle cx="18" cy="18" r="15" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15" fill="none" stroke="#2563eb" strokeWidth="3" strokeDasharray={`${(completionDone / completionTotal) * 94.2} 94.2`} strokeLinecap="round" style={{ transition: "stroke-dasharray 1s cubic-bezier(0.4, 0, 0.2, 1)" }} />
                  </svg>
                </div>
              </Card>
            )}
            {d?.teamStats && (
              <Card style={{ padding: "24px", background: "linear-gradient(135deg, #eff6ff, #f8fafc)" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#3b82f6", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Team Overview</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
                  {[
                    { label: "Members", val: d.teamStats.teamSize || 0, icon: "👥" },
                    { label: "Processes", val: d.teamStats.processesHandled || 0, icon: "📊" },
                    { label: "Completion", val: `${d.teamStats.completedRate || 0}%`, icon: "🏆", accent: "#2563eb" },
                  ].map((stat) => (
                    <div key={stat.label} style={{ textAlign: "center", background: "#fff", padding: "12px 8px", borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.02)" }}>
                      <div style={{ fontSize: 22, marginBottom: 6 }}>{stat.icon}</div>
                      <div style={{ fontSize: 24, fontWeight: 900, color: stat.accent || "#0f172a" }}>{stat.val}</div>
                      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 4 }}>{stat.label}</div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

      </div>

      {/* ─── DRAWER OVERLAY ─── */}
      <Drawer open={drawer.open} onClose={closeDrawer} title={drawer.title} subtitle={drawer.subtitle}>
        {drawer.drillLoading
          ? <div style={{ textAlign: "center", padding: "60px 0", color: "#94a3b8" }}><div style={{ fontSize: 24, marginBottom: 12 }}>⟳</div><div style={{ fontWeight: 600 }}>Loading data...</div></div>
          : !(drawer.drillData || []).length
            ? <Empty icon="📭" text="Nothing to show here" />
            : <DrawerList
                data={drawer.drillData || []}
                type={drawer.type}
                page={drawer.page}
                total={drawer.total}
                onPageChange={(newPage) => fetchDrawerData(drawer.type, drawer.title, drawer.subtitle, newPage)}
                onViewProcess={(id, isPending) => { closeDrawer(); goToProcess(id, isPending); }}
                onViewDoc={openDoc}
              />
        }
      </Drawer>

      {/* ─── FILE VIEWER ─── */}
      {fileView && (
        <div style={{ position: "relative", zIndex: 99999 }}>
          <ViewFile docu={fileView} setFileView={setFileView} handleViewClose={() => setFileView(null)} />
        </div>
      )}
    </div>
  );
}