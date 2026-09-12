import React, { useState, useEffect, useCallback, useRef } from "react";
import { Sun, Moon, Users, AlertTriangle, Plus, X, Check, ChevronLeft, ChevronRight, Clock, LogOut, Bell, Repeat, Download, Printer, Lock, Shield } from "lucide-react";
import { api, getToken, setToken } from "./api.js";

/* ---------- constants ---------- */

const SHIFTS = {
  day: { key: "day", label: "Day", time: "07:00–19:00", hours: 12 },
  night: { key: "night", label: "Night", time: "19:00–07:00", hours: 12 },
};
const ROLES = ["Paramedic", "EMT", "Driver", "Control", "Manager"];

/* ---------- date helpers ---------- */

function toISODate(d) { return d.toISOString().slice(0, 10); }
function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() + ((day === 0 ? -6 : 1) - day));
  date.setHours(0, 0, 0, 0);
  return date;
}
function addDays(d, n) { const date = new Date(d); date.setDate(date.getDate() + n); return date; }
function weekDates(weekStart) { return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)); }
function fmtDay(d) { return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }); }
function fmtRange(a, b) { return `${a.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${b.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`; }

/* ---------- compliance helpers (client-side, mirrors backend data) ---------- */

function checkConflicts(entries, staffId, date, shiftKey) {
  const warnings = [];
  const iso = toISODate(date);
  const prevIso = toISODate(addDays(date, -1));
  const nextIso = toISODate(addDays(date, 1));
  const mine = entries.filter((e) => e.staffId === staffId);
  if (shiftKey === "day") {
    if (mine.some((e) => e.date === prevIso && e.shift === "night")) warnings.push("No rest after last night shift");
    if (mine.some((e) => e.date === iso && e.shift === "night")) warnings.push("Already on nights this day");
  }
  if (shiftKey === "night") {
    if (mine.some((e) => e.date === iso && e.shift === "day")) warnings.push("Already on days this day");
    if (mine.some((e) => e.date === nextIso && e.shift === "day")) warnings.push("Leaves no rest before next day shift");
  }
  return warnings;
}
function weeklyHours(entries, staffId, dates) {
  const isos = new Set(dates.map(toISODate));
  return entries.filter((e) => e.staffId === staffId && isos.has(e.date)).length * 12;
}
function skillGaps(roster, skillRules) {
  return (skillRules || []).map((rule) => {
    const count = roster.filter((x) => x.staff.role === rule.role).length;
    return count < rule.min ? `Needs ${rule.min}+ ${rule.role}` : null;
  }).filter(Boolean);
}

/* ---------- csv / print ---------- */

function downloadCSV(dates, data) {
  const rows = [["Date", "Day", "Shift", "Staff", "Role"]];
  dates.forEach((d) => {
    const iso = toISODate(d);
    ["day", "night"].forEach((shiftKey) => {
      data.entries.filter((e) => e.date === iso && e.shift === shiftKey).forEach((e) => {
        const s = data.staff.find((x) => x.id === e.staffId);
        if (s) rows.push([iso, d.toLocaleDateString("en-GB", { weekday: "long" }), SHIFTS[shiftKey].label, s.name, s.role]);
      });
    });
  });
  const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rota-${toISODate(dates[0])}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------- main app ---------- */

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("board");
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = (type, text) => {
    setToast({ type, text });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  };

  // check for an existing session on load
  useEffect(() => {
    (async () => {
      if (getToken()) {
        try { setUser(await api("/auth/me")); }
        catch { setToken(null); }
      }
      setAuthChecked(true);
    })();
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [staff, patterns, settings, entries, requests, swaps, notifications] = await Promise.all([
        api("/staff"), api("/patterns"), api("/settings"), api("/entries"), api("/requests"), api("/swaps"), api("/notifications"),
      ]);
      setData({ staff, patterns, settings, entries, requests, swaps, notifications });
    } catch (e) {
      showToast("error", e.message);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    refresh();
    const interval = window.setInterval(refresh, 20000); // light polling so multiple devices stay roughly in sync
    return () => window.clearInterval(interval);
  }, [user, refresh]);

  const run = async (fn, okMessage) => {
    try {
      await fn();
      await refresh();
      if (okMessage) showToast("ok", okMessage);
    } catch (e) {
      showToast("error", e.message);
    }
  };

  if (!authChecked) return <Shell><div style={{ padding: 40, color: "var(--slate)" }}>Loading…</div></Shell>;

  if (!user) {
    return (
      <Shell>
        <LoginGate onAuthed={(u) => setUser(u)} />
        <GlobalStyle />
      </Shell>
    );
  }

  if (!data) return <Shell><div style={{ padding: 40, color: "var(--slate)" }}>Loading rota…</div></Shell>;

  const isAdmin = user.role === "Manager";
  const dates = weekDates(weekStart);

  return (
    <Shell>
      <TopBar
        currentUser={user} data={data}
        onSwitch={() => { setToken(null); setUser(null); setData(null); }}
        weekLabel={fmtRange(dates[0], dates[6])}
        onPrevWeek={() => setWeekStart(addDays(weekStart, -7))}
        onNextWeek={() => setWeekStart(addDays(weekStart, 7))}
        onToday={() => setWeekStart(startOfWeek(new Date()))}
        onMarkRead={() => run(() => api("/notifications/mark-read", { method: "POST" }))}
      />
      <TabBar tab={tab} setTab={setTab} isAdmin={isAdmin}
        pendingCount={data.requests.filter((r) => r.status === "pending").length +
          data.swaps.filter((s) => (isAdmin ? s.status === "awaiting_manager" : s.toStaffId === user.id && s.status === "awaiting_colleague")).length}
      />

      <div className="no-print" style={{ padding: "20px 28px 60px", maxWidth: 1180, margin: "0 auto" }}>
        {tab === "board" && (
          <RotaBoard
            data={data} dates={dates} isAdmin={isAdmin}
            onAssign={(staffId, date, shift) => run(() => api("/entries", { method: "POST", body: { staffId, date: toISODate(date), shift } }))}
            onRemove={(entryId) => run(() => api(`/entries/${entryId}`, { method: "DELETE" }))}
            onGenerate={() => run(() => api("/entries/generate", { method: "POST", body: { from: toISODate(dates[0]), to: toISODate(dates[6]) } }), "Generated shifts from patterns.")}
            onPublish={() => run(async () => {
              const res = await api("/entries/publish", { method: "POST", body: { from: toISODate(dates[0]), to: toISODate(dates[6]) } });
              showToast("ok", `Published — ${res.notified} staff notified.`);
            })}
          />
        )}

        {tab === "mine" && (
          <MyRota data={data} currentUser={user} dates={dates}
            onProposeSwap={(swap) => run(() => api("/swaps", { method: "POST", body: swap }), "Swap offer sent.")}
          />
        )}

        {tab === "requests" && (
          <RequestsTab
            data={data} currentUser={user} isAdmin={isAdmin}
            onSubmit={(req) => run(() => api("/requests", { method: "POST", body: req }), "Request submitted.")}
            onDecide={(id, status) => run(() => api(`/requests/${id}`, { method: "PATCH", body: { status } }))}
            onSwapRespond={(id, accept) => run(() => api(`/swaps/${id}/respond`, { method: "PATCH", body: { accept } }))}
            onSwapDecide={(id, approve) => run(() => api(`/swaps/${id}/decide`, { method: "PATCH", body: { approve } }))}
          />
        )}

        {tab === "team" && isAdmin && (
          <TeamAdmin
            data={data}
            onAdd={(name, role) => run(() => api("/staff", { method: "POST", body: { name, role } }), "Crew member added.")}
            onSetTarget={(n) => run(() => api("/settings", { method: "PATCH", body: { targetPerShift: n } }))}
            onSkillRulesChange={(rules) => run(() => api("/settings", { method: "PATCH", body: { skillRules: rules } }))}
            onResetPin={(id) => run(() => api(`/auth/reset-password/${id}`, { method: "POST" }), "Password reset — they'll set a new one at next sign-in.")}
            onAssignPattern={(id, patternId, anchor) => run(() => api(`/staff/${id}/pattern`, { method: "PATCH", body: { patternId, patternAnchor: anchor } }))}
            onAddPattern={(name, sequence) => run(() => api("/patterns", { method: "POST", body: { name, sequence } }), "Pattern saved.")}
          />
        )}
      </div>

      <PrintSheet data={data} dates={dates} />

      {toast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: toast.type === "error" ? "var(--rescue-red)" : "var(--ink)", color: "#fff", padding: "10px 18px", borderRadius: 6, fontSize: 14, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", zIndex: 50, maxWidth: 420, textAlign: "center" }}>
          {toast.text}
        </div>
      )}
      <GlobalStyle />
    </Shell>
  );
}

/* ---------- shell / chrome ---------- */

function Shell({ children }) {
  return <div style={{ minHeight: "100vh", background: "var(--paper)", fontFamily: "var(--font-body)", color: "var(--ink)" }}>{children}</div>;
}

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
      :root {
        --ink:#0F1B2D; --paper:#F7F5F0; --signal-green:#1F7A4D; --amber:#C97F1E; --rescue-red:#B23A24;
        --slate:#5C6773; --line:#DCD7CC; --card:#FFFFFF; --font-head:'Barlow Condensed',sans-serif; --font-body:'IBM Plex Sans',sans-serif;
      }
      * { box-sizing: border-box; }
      body { margin: 0; }
      button { font-family: var(--font-body); cursor: pointer; }
      select, input, textarea { font-family: var(--font-body); }
      ::selection { background: var(--amber); color: #fff; }
      .print-only { display: none; }
      @media print {
        .no-print { display: none !important; }
        .print-only { display: block !important; }
      }
    `}</style>
  );
}

/* ---------- login / auth ---------- */

function LoginGate({ onAuthed }) {
  const [staffList, setStaffList] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [stage, setStage] = useState("pick");
  const [selected, setSelected] = useState(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState(0);
  const [name, setName] = useState("");
  const [role, setRole] = useState(ROLES[0]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/auth/staff", { auth: false }).then(setStaffList).catch((e) => setLoadError(e.message));
  }, []);

  const pick = (s) => { setSelected(s); setPassword(""); setError(""); setStage(s.hasPassword ? "password" : "setpassword"); };

  const submitPassword = async () => {
    if (attempts >= 5) { setError("Too many attempts this session — ask a manager to reset your password."); return; }
    setBusy(true);
    try {
      const res = await api("/auth/login", { method: "POST", auth: false, body: { staffId: selected.id, password } });
      setToken(res.token);
      onAuthed(res.staff);
    } catch (e) {
      setAttempts((a) => a + 1); setError(e.message); setPassword("");
    } finally { setBusy(false); }
  };

  const submitSetPassword = async () => {
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    setBusy(true);
    try {
      const res = await api("/auth/set-password", { method: "POST", auth: false, body: { staffId: selected.id, password } });
      setToken(res.token);
      onAuthed(res.staff);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const submitAdd = async () => {
    if (!name.trim()) return;
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    setBusy(true);
    try {
      const res = await api("/auth/register", { method: "POST", auth: false, body: { name: name.trim(), role, password } });
      setToken(res.token);
      onAuthed(res.staff);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginBottom: 26 }}>
          <img src="/mes-logo.png" alt="MES — Medical Emergency Solutions" style={{ height: 64, objectFit: "contain" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "var(--font-head)", fontSize: 24, fontWeight: 700, lineHeight: 1.1, color: "var(--ink)" }}>Dynamo</div>
            <div style={{ fontSize: 13, color: "var(--slate)" }}>Crew rota — days & nights</div>
          </div>
        </div>

        {loadError && <div style={{ ...cardStyle, color: "var(--rescue-red)", fontSize: 13.5 }}>Can't reach the server ({loadError}). Check the API is running and VITE_API_URL is set correctly.</div>}

        {!loadError && stage === "pick" && (
          <div style={cardStyle}>
            <div style={{ fontSize: 14, color: "var(--slate)", marginBottom: 14 }}>Who's checking in?</div>
            {!staffList ? <div style={{ fontSize: 13, color: "var(--slate)" }}>Loading…</div> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 320, overflowY: "auto" }}>
                {staffList.map((s) => (
                  <button key={s.id} onClick={() => pick(s)} style={rowBtnStyle}>
                    <span style={{ fontWeight: 500 }}>{s.name}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--slate)" }}>
                      {s.hasPassword && <Lock size={11} />} {s.role}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => { setStage("add"); setName(""); setPassword(""); setConfirmPassword(""); setError(""); }} style={linkBtnStyle}>+ New starter? Add yourself</button>
          </div>
        )}

        {stage === "password" && (
          <div style={cardStyle}>
            <div style={{ fontSize: 14, marginBottom: 4 }}>Enter your password</div>
            <div style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 12 }}>{selected.name}</div>
            <input autoFocus type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitPassword()} style={{ ...inputStyle, width: "100%", marginBottom: 10 }} />
            {error && <div style={errorStyle}>{error}</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={() => setStage("pick")} style={secondaryBtn}>Back</button>
              <button disabled={busy} onClick={submitPassword} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>Sign in</button>
            </div>
          </div>
        )}

        {stage === "setpassword" && (
          <div style={cardStyle}>
            <div style={{ fontSize: 14, marginBottom: 4 }}>Set a password for {selected.name}</div>
            <div style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 12 }}>First time signing in — choose a password of at least 8 characters.</div>
            <input autoFocus type="password" placeholder="New password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...inputStyle, width: "100%", marginBottom: 8 }} />
            <input type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={{ ...inputStyle, width: "100%", marginBottom: 10 }} />
            {error && <div style={errorStyle}>{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setStage("pick")} style={secondaryBtn}>Back</button>
              <button disabled={busy} onClick={submitSetPassword} style={{ ...primaryBtn, opacity: busy ? 0.6 : 1 }}>Save & sign in</button>
            </div>
          </div>
        )}

        {stage === "add" && (
          <div style={cardStyle}>
            <div style={{ fontSize: 14, color: "var(--slate)", marginBottom: 12 }}>Add yourself to the directory</div>
            <input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, width: "100%", marginBottom: 8 }} />
            <select value={role} onChange={(e) => setRole(e.target.value)} style={{ ...inputStyle, width: "100%", marginBottom: 8 }}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
            <input type="password" placeholder="Choose a password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...inputStyle, width: "100%", marginBottom: 8 }} />
            <input type="password" placeholder="Confirm password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={{ ...inputStyle, width: "100%", marginBottom: 10 }} />
            {error && <div style={errorStyle}>{error}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setStage("pick")} style={secondaryBtn}>Back</button>
              <button disabled={!name.trim() || busy} onClick={submitAdd} style={{ ...primaryBtn, opacity: name.trim() && !busy ? 1 : 0.5 }}>Join</button>
            </div>
          </div>
        )}

        <div style={{ fontSize: 12, color: "var(--slate)", marginTop: 14, lineHeight: 1.5, display: "flex", gap: 6 }}>
          <Shield size={26} />
          <span>Passwords are hashed with bcrypt on the server and never stored in plain text. Self-service "add yourself" is open by default — see the README if you'd rather lock new sign-ups behind manager approval.</span>
        </div>
      </div>
    </div>
  );
}

const cardStyle = { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 20 };
const rowBtnStyle = { textAlign: "left", padding: "10px 12px", borderRadius: 7, border: "1px solid var(--line)", background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" };
const linkBtnStyle = { marginTop: 14, background: "none", border: "none", color: "var(--signal-green)", fontSize: 13, fontWeight: 600, padding: 0 };
const inputStyle = { padding: "9px 10px", border: "1px solid var(--line)", borderRadius: 6, fontSize: 14 };
const primaryBtn = { flex: 1, padding: "9px 0", borderRadius: 6, border: "none", background: "var(--signal-green)", color: "#fff", fontWeight: 600 };
const secondaryBtn = { flex: 1, padding: "9px 0", borderRadius: 6, border: "1px solid var(--line)", background: "#fff" };
const errorStyle = { fontSize: 12.5, color: "var(--rescue-red)", marginBottom: 6 };

/* ---------- top bar / tabs ---------- */

function TopBar({ currentUser, data, onSwitch, weekLabel, onPrevWeek, onNextWeek, onToday, onMarkRead }) {
  const [open, setOpen] = useState(false);
  const mine = [...data.notifications].sort((a, b) => b.ts - a.ts);
  const unread = mine.filter((n) => !n.readBy.includes(currentUser.id)).length;

  return (
    <div className="no-print" style={{ background: "var(--ink)", color: "#fff", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ background: "#fff", borderRadius: 6, padding: "3px 8px", display: "flex", alignItems: "center" }}>
          <img src="/mes-logo.png" alt="MES" style={{ height: 22, objectFit: "contain" }} />
        </div>
        <span style={{ fontFamily: "var(--font-head)", fontSize: 22, fontWeight: 700 }}>Dynamo</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <button onClick={onPrevWeek} style={navBtn}><ChevronLeft size={16} color="#fff" /></button>
        <button onClick={onToday} style={{ ...navBtn, padding: "6px 12px", fontSize: 13 }}>This week</button>
        <span style={{ fontSize: 14, minWidth: 190, textAlign: "center" }}>{weekLabel}</span>
        <button onClick={onNextWeek} style={navBtn}><ChevronRight size={16} color="#fff" /></button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ position: "relative" }}>
          <button onClick={() => { setOpen((o) => !o); if (!open) onMarkRead(); }} style={navBtn}><Bell size={16} color="#fff" /></button>
          {unread > 0 && <span style={badgeStyle}>{unread}</span>}
          {open && (
            <div style={dropdownStyle}>
              <div style={{ padding: "10px 12px", fontWeight: 600, fontSize: 13, borderBottom: "1px solid var(--line)", color: "var(--ink)" }}>Notifications</div>
              {mine.length === 0 && <div style={{ padding: 14, fontSize: 13, color: "var(--slate)" }}>Nothing yet.</div>}
              {mine.slice(0, 12).map((n) => (
                <div key={n.id} style={{ padding: "9px 12px", borderBottom: "1px solid var(--line)", fontSize: 12.5, color: "var(--ink)" }}>
                  {n.text}
                  <div style={{ fontSize: 11, color: "var(--slate)", marginTop: 2 }}>{new Date(n.ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{currentUser.name}</div>
          <div style={{ fontSize: 11, color: "#B9C2CE" }}>{currentUser.role}</div>
        </div>
        <button onClick={onSwitch} style={navBtn} title="Sign out"><LogOut size={16} color="#fff" /></button>
      </div>
    </div>
  );
}
const navBtn = { background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 6, padding: 6, display: "flex", alignItems: "center" };
const badgeStyle = { position: "absolute", top: -3, right: -3, background: "var(--rescue-red)", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 20, minWidth: 15, height: 15, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" };
const dropdownStyle = { position: "absolute", top: 36, right: 0, width: 300, maxHeight: 340, overflowY: "auto", background: "#fff", borderRadius: 8, boxShadow: "0 12px 30px rgba(0,0,0,0.25)", zIndex: 60 };

function TabBar({ tab, setTab, isAdmin, pendingCount }) {
  const tabs = [
    { key: "board", label: "Duty board" },
    { key: "mine", label: "My rota" },
    { key: "requests", label: `Requests${pendingCount ? ` (${pendingCount})` : ""}` },
    ...(isAdmin ? [{ key: "team", label: "Team" }] : []),
  ];
  return (
    <div className="no-print" style={{ background: "#fff", borderBottom: "1px solid var(--line)", padding: "0 28px", display: "flex", gap: 4 }}>
      {tabs.map((t) => (
        <button key={t.key} onClick={() => setTab(t.key)} style={{ padding: "13px 16px", background: "none", border: "none", borderBottom: tab === t.key ? "2.5px solid var(--signal-green)" : "2.5px solid transparent", fontWeight: tab === t.key ? 600 : 500, color: tab === t.key ? "var(--ink)" : "var(--slate)", fontSize: 14 }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- duty board ---------- */

function RotaBoard({ data, dates, isAdmin, onAssign, onRemove, onGenerate, onPublish }) {
  const [picking, setPicking] = useState(null);
  const target = data.settings.targetPerShift;

  const staffOn = (dateIso, shift) => data.entries.filter((e) => e.date === dateIso && e.shift === shift)
    .map((e) => ({ entry: e, staff: data.staff.find((s) => s.id === e.staffId) })).filter((x) => x.staff);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontFamily: "var(--font-head)", fontSize: 30, margin: 0 }}>This week's duty board</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, color: "var(--slate)" }}>Target: {target} crew/shift</div>
          {isAdmin && <>
            <button onClick={onGenerate} style={smallBtn}><Repeat size={13} /> Generate from patterns</button>
            <button onClick={onPublish} style={smallBtn}>Publish week</button>
          </>}
          <button onClick={() => downloadCSV(dates, data)} style={smallBtn}><Download size={13} /> CSV</button>
          <button onClick={() => window.print()} style={smallBtn}><Printer size={13} /> Print</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
        {dates.map((d) => {
          const iso = toISODate(d);
          const isToday = iso === toISODate(new Date());
          return (
            <div key={iso} style={{ border: isToday ? "1.5px solid var(--signal-green)" : "1px solid var(--line)", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
              <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--line)", fontSize: 12.5, fontWeight: 600, background: isToday ? "#EAF4EE" : "#FAF9F6" }}>{fmtDay(d)}</div>
              {["day", "night"].map((shiftKey) => {
                const roster = staffOn(iso, shiftKey);
                const short = roster.length < target;
                const gaps = skillGaps(roster, data.settings.skillRules);
                return (
                  <div key={shiftKey} style={{ padding: "9px 10px", borderBottom: shiftKey === "day" ? "1px dashed var(--line)" : "none", background: shiftKey === "night" ? "var(--ink)" : "#fff", color: shiftKey === "night" ? "#fff" : "var(--ink)", minHeight: 118 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, marginBottom: 6, opacity: 0.85 }}>
                      {shiftKey === "day" ? <Sun size={12} /> : <Moon size={12} />} {SHIFTS[shiftKey].time}
                      <span style={{ marginLeft: "auto", color: short ? "var(--amber)" : (shiftKey === "night" ? "#8FE0B0" : "var(--signal-green)"), fontWeight: 700 }}>{roster.length}/{target}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {roster.map(({ entry, staff }) => (
                        <div key={entry.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, background: shiftKey === "night" ? "rgba(255,255,255,0.1)" : "#F2F1EC", borderRadius: 5, padding: "3px 6px", fontSize: 12.5 }}>
                          <span>{staff.name.split(" ")[0]} {staff.name.split(" ")[1]?.[0]}. {entry.source === "pattern" && <span style={{ opacity: 0.6 }}>·pattern</span>}</span>
                          {isAdmin && <button onClick={() => onRemove(entry.id)} style={{ background: "none", border: "none", padding: 0, display: "flex", opacity: 0.6 }}><X size={11} color={shiftKey === "night" ? "#fff" : "var(--ink)"} /></button>}
                        </div>
                      ))}
                    </div>
                    {gaps.length > 0 && (
                      <div style={{ marginTop: 5, fontSize: 10.5, color: "var(--rescue-red)", background: shiftKey === "night" ? "rgba(178,58,36,0.25)" : "#FBEAE6", borderRadius: 4, padding: "2px 5px" }}>
                        <AlertTriangle size={10} style={{ verticalAlign: -1 }} /> {gaps.join(" · ")}
                      </div>
                    )}
                    {isAdmin && (
                      <button onClick={() => setPicking({ date: d, shift: shiftKey })} style={{ marginTop: 6, width: "100%", border: `1px dashed ${shiftKey === "night" ? "rgba(255,255,255,0.35)" : "var(--line)"}`, background: "none", borderRadius: 5, padding: "3px 0", display: "flex", alignItems: "center", justifyContent: "center", color: shiftKey === "night" ? "#fff" : "var(--slate)", opacity: 0.8 }}>
                        <Plus size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <WeeklyHours data={data} dates={dates} />

      {picking && (
        <StaffPicker data={data} date={picking.date} shift={picking.shift} onClose={() => setPicking(null)} onChoose={(staffId) => { onAssign(staffId, picking.date, picking.shift); setPicking(null); }} />
      )}
    </div>
  );
}
const smallBtn = { display: "flex", alignItems: "center", gap: 5, background: "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 10px", fontSize: 12.5, fontWeight: 500 };

function StaffPicker({ data, date, shift, onClose, onChoose }) {
  const [query, setQuery] = useState("");
  const iso = toISODate(date);
  const alreadyOn = new Set(data.entries.filter((e) => e.date === iso && e.shift === shift).map((e) => e.staffId));
  const candidates = data.staff.filter((s) => !alreadyOn.has(s.id) && s.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 10, width: 360, maxHeight: "70vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Add to {SHIFTS[shift].label.toLowerCase()} shift</div>
          <div style={{ fontSize: 12.5, color: "var(--slate)" }}>{fmtDay(date)}</div>
          <input autoFocus placeholder="Search crew…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginTop: 8, width: "100%", padding: "7px 9px", border: "1px solid var(--line)", borderRadius: 6, fontSize: 13.5 }} />
        </div>
        <div style={{ overflowY: "auto", padding: 8 }}>
          {candidates.length === 0 && <div style={{ padding: 12, fontSize: 13, color: "var(--slate)" }}>No one matches.</div>}
          {candidates.map((s) => {
            const warnings = checkConflicts(data.entries, s.id, date, shift);
            return (
              <button key={s.id} onClick={() => onChoose(s.id)} style={{ width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 7, border: "1px solid var(--line)", marginBottom: 6, background: warnings.length ? "#FBF0E9" : "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 500, fontSize: 13.5 }}>{s.name}</span>
                  <span style={{ fontSize: 11.5, color: "var(--slate)" }}>{s.role}</span>
                </div>
                {warnings.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 3, fontSize: 11.5, color: "var(--rescue-red)" }}><AlertTriangle size={11} /> {warnings.join(" · ")}</div>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeeklyHours({ data, dates }) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontFamily: "var(--font-head)", fontSize: 19, marginBottom: 8 }}>Hours this week</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {data.staff.map((s) => {
          const hrs = weeklyHours(data.entries, s.id, dates);
          const over = hrs > 48;
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 20, border: `1px solid ${over ? "var(--rescue-red)" : "var(--line)"}`, background: over ? "#FBEAE6" : "#fff", fontSize: 12.5 }}>
              <Clock size={12} color={over ? "var(--rescue-red)" : "var(--slate)"} /> {s.name}: <strong>{hrs}h</strong> {over && <AlertTriangle size={12} color="var(--rescue-red)" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- my rota ---------- */

function MyRota({ data, currentUser, dates, onProposeSwap }) {
  const [swapFor, setSwapFor] = useState(null);
  const mine = data.entries.filter((e) => e.staffId === currentUser.id && dates.some((d) => toISODate(d) === e.date)).sort((a, b) => a.date.localeCompare(b.date));
  const hrs = weeklyHours(data.entries, currentUser.id, dates);

  return (
    <div>
      <h1 style={{ fontFamily: "var(--font-head)", fontSize: 30, margin: "0 0 4px" }}>My rota</h1>
      <div style={{ fontSize: 13.5, color: "var(--slate)", marginBottom: 18 }}>{hrs} hours scheduled this week</div>

      {mine.length === 0 ? (
        <div style={{ padding: 24, background: "#fff", border: "1px dashed var(--line)", borderRadius: 10, color: "var(--slate)", fontSize: 14 }}>No shifts on the board for you this week yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {mine.map((e) => {
            const s = SHIFTS[e.shift];
            return (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderRadius: 9, background: e.shift === "night" ? "var(--ink)" : "#fff", color: e.shift === "night" ? "#fff" : "var(--ink)", border: e.shift === "night" ? "none" : "1px solid var(--line)" }}>
                {e.shift === "day" ? <Sun size={18} color="var(--signal-green)" /> : <Moon size={18} color="var(--amber)" />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14.5 }}>{new Date(e.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}</div>
                  <div style={{ fontSize: 12.5, opacity: 0.8 }}>{s.label} shift · {s.time}</div>
                </div>
                <button onClick={() => setSwapFor(e)} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: `1px solid ${e.shift === "night" ? "rgba(255,255,255,0.35)" : "var(--line)"}`, borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "inherit" }}>
                  <Repeat size={12} /> Swap
                </button>
              </div>
            );
          })}
        </div>
      )}

      {swapFor && (
        <SwapModal data={data} currentUser={currentUser} entry={swapFor} onClose={() => setSwapFor(null)}
          onSubmit={(colleagueId, colleagueEntryId, note) => {
            onProposeSwap({ fromEntryId: swapFor.id, toStaffId: colleagueId, toEntryId: colleagueEntryId, note });
            setSwapFor(null);
          }} />
      )}
    </div>
  );
}

function SwapModal({ data, currentUser, entry, onClose, onSubmit }) {
  const [colleagueId, setColleagueId] = useState("");
  const [colleagueEntryId, setColleagueEntryId] = useState("");
  const [note, setNote] = useState("");
  const colleagues = data.staff.filter((s) => s.id !== currentUser.id);
  const theirShifts = data.entries.filter((e) => e.staffId === colleagueId);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,27,45,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 10, width: 380, padding: 18 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Propose a swap</div>
        <div style={{ fontSize: 12.5, color: "var(--slate)", marginBottom: 12 }}>{new Date(entry.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · {SHIFTS[entry.shift].label}</div>
        <select value={colleagueId} onChange={(e) => { setColleagueId(e.target.value); setColleagueEntryId(""); }} style={{ ...inputStyle, width: "100%", marginBottom: 8 }}>
          <option value="">Choose a colleague…</option>
          {colleagues.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.role}</option>)}
        </select>
        {colleagueId && (
          <select value={colleagueEntryId} onChange={(e) => setColleagueEntryId(e.target.value)} style={{ ...inputStyle, width: "100%", marginBottom: 8 }}>
            <option value="">No shift in return — just cover mine</option>
            {theirShifts.map((s) => <option key={s.id} value={s.id}>{s.date} · {SHIFTS[s.shift].label}</option>)}
          </select>
        )}
        <textarea placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ ...inputStyle, width: "100%", minHeight: 56, marginBottom: 10, resize: "vertical" }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={secondaryBtn}>Cancel</button>
          <button disabled={!colleagueId} onClick={() => colleagueId && onSubmit(colleagueId, colleagueEntryId || null, note)} style={{ ...primaryBtn, opacity: colleagueId ? 1 : 0.5 }}>Send offer</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- requests (leave/change + swaps) ---------- */

function RequestsTab({ data, currentUser, isAdmin, onSubmit, onDecide, onSwapRespond, onSwapDecide }) {
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState("leave");
  const [from, setFrom] = useState(toISODate(new Date()));
  const [to, setTo] = useState(toISODate(new Date()));
  const [reason, setReason] = useState("");

  const sortedReq = [...data.requests].sort((a, b) => (a.status === b.status ? 0 : a.status === "pending" ? -1 : 1));
  const incomingSwaps = data.swaps.filter((s) => s.toStaffId === currentUser.id && s.status === "awaiting_colleague");
  const managerSwaps = isAdmin ? data.swaps.filter((s) => s.status === "awaiting_manager") : [];
  const mySwaps = data.swaps.filter((s) => s.fromStaffId === currentUser.id || s.toStaffId === currentUser.id);

  const submit = () => {
    if (!reason.trim()) return;
    onSubmit({ type, from, to, reason: reason.trim() });
    setShowForm(false); setReason("");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h1 style={{ fontFamily: "var(--font-head)", fontSize: 30, margin: 0 }}>Requests</h1>
        {!isAdmin && <button onClick={() => setShowForm(true)} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--signal-green)", color: "#fff", border: "none", borderRadius: 7, padding: "9px 14px", fontWeight: 600, fontSize: 13.5 }}><Plus size={15} /> New request</button>}
      </div>

      {showForm && (
        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: 16, marginBottom: 18 }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
              <option value="leave">Leave / unavailable</option>
              <option value="change">Shift change request</option>
            </select>
            <label style={{ fontSize: 13, color: "var(--slate)", display: "flex", alignItems: "center", gap: 6 }}>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} /></label>
            <label style={{ fontSize: 13, color: "var(--slate)", display: "flex", alignItems: "center", gap: 6 }}>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} /></label>
          </div>
          <textarea placeholder="Reason / details" value={reason} onChange={(e) => setReason(e.target.value)} style={{ ...inputStyle, width: "100%", minHeight: 64, marginBottom: 10, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={submit} style={{ background: "var(--signal-green)", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 600 }}>Submit</button>
            <button onClick={() => setShowForm(false)} style={{ background: "none", border: "1px solid var(--line)", borderRadius: 6, padding: "8px 16px" }}>Cancel</button>
          </div>
        </div>
      )}

      {incomingSwaps.length > 0 && (
        <Section title="Swap offers for you">
          {incomingSwaps.map((s) => {
            const fromEntry = data.entries.find((e) => e.id === s.fromEntryId);
            const fromName = data.staff.find((x) => x.id === s.fromStaffId)?.name || "Colleague";
            return (
              <RowCard key={s.id}
                left={<>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{fromName} wants to swap</div>
                  <div style={{ fontSize: 13, color: "var(--slate)" }}>{fromEntry ? `${fromEntry.date} · ${SHIFTS[fromEntry.shift].label}` : "a shift"}</div>
                </>}
                right={<>
                  <button onClick={() => onSwapRespond(s.id, true)} style={pillBtn("var(--signal-green)")}><Check size={13} /></button>
                  <button onClick={() => onSwapRespond(s.id, false)} style={pillBtn("var(--rescue-red)")}><X size={13} /></button>
                </>} />
            );
          })}
        </Section>
      )}

      {isAdmin && managerSwaps.length > 0 && (
        <Section title="Swaps awaiting your approval">
          {managerSwaps.map((s) => {
            const fromEntry = data.entries.find((e) => e.id === s.fromEntryId);
            const toEntry = s.toEntryId ? data.entries.find((e) => e.id === s.toEntryId) : null;
            const fromName = data.staff.find((x) => x.id === s.fromStaffId)?.name;
            const toName = data.staff.find((x) => x.id === s.toStaffId)?.name;
            return (
              <RowCard key={s.id}
                left={<>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{fromName} ↔ {toName}</div>
                  <div style={{ fontSize: 13, color: "var(--slate)" }}>{fromEntry ? `${fromEntry.date} ${SHIFTS[fromEntry.shift].label}` : "shift"} {toEntry ? `for ${toEntry.date} ${SHIFTS[toEntry.shift].label}` : "(no return shift)"}</div>
                </>}
                right={<>
                  <button onClick={() => onSwapDecide(s.id, true)} style={pillBtn("var(--signal-green)")}><Check size={13} /></button>
                  <button onClick={() => onSwapDecide(s.id, false)} style={pillBtn("var(--rescue-red)")}><X size={13} /></button>
                </>} />
            );
          })}
        </Section>
      )}

      {mySwaps.length > 0 && (
        <Section title="Your swaps">
          {mySwaps.map((s) => {
            const fromEntry = data.entries.find((e) => e.id === s.fromEntryId);
            const other = data.staff.find((x) => x.id === (s.fromStaffId === currentUser.id ? s.toStaffId : s.fromStaffId))?.name;
            return (
              <RowCard key={s.id}
                left={<>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>With {other}</div>
                  <div style={{ fontSize: 13, color: "var(--slate)" }}>{fromEntry ? `${fromEntry.date} · ${SHIFTS[fromEntry.shift].label}` : "shift"}</div>
                </>}
                right={<StatusPill status={s.status === "awaiting_colleague" || s.status === "awaiting_manager" ? "pending" : s.status} />} />
            );
          })}
        </Section>
      )}

      <Section title={isAdmin ? "Leave & change requests" : "Your leave & change requests"}>
        {sortedReq.length === 0 ? (
          <div style={{ padding: 20, background: "#fff", border: "1px dashed var(--line)", borderRadius: 10, color: "var(--slate)", fontSize: 14 }}>Nothing here yet.</div>
        ) : sortedReq.map((r) => {
          const staffName = data.staff.find((s) => s.id === r.staffId)?.name || "Unknown";
          return (
            <RowCard key={r.id}
              left={<>
                {isAdmin && <div style={{ fontWeight: 600, fontSize: 13.5 }}>{staffName}</div>}
                <div style={{ fontSize: 13, color: "var(--slate)" }}>{r.type === "leave" ? "Leave" : "Shift change"} · {r.from} to {r.to}</div>
                <div style={{ fontSize: 13.5, marginTop: 3 }}>{r.reason}</div>
              </>}
              right={<>
                <StatusPill status={r.status} />
                {isAdmin && r.status === "pending" && <>
                  <button onClick={() => onDecide(r.id, "approved")} style={pillBtn("var(--signal-green)")}><Check size={13} /></button>
                  <button onClick={() => onDecide(r.id, "declined")} style={pillBtn("var(--rescue-red)")}><X size={13} /></button>
                </>}
              </>} />
          );
        })}
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontFamily: "var(--font-head)", fontSize: 19, marginBottom: 8 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{children}</div>
    </div>
  );
}
function RowCard({ left, right }) {
  return (
    <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: 9, padding: "12px 16px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <div>{left}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{right}</div>
    </div>
  );
}
const pillBtn = (color) => ({ background: color, border: "none", borderRadius: 5, padding: 6, display: "flex", color: "#fff" });

function StatusPill({ status }) {
  const map = { pending: ["var(--amber)", "Pending"], approved: ["var(--signal-green)", "Approved"], declined: ["var(--rescue-red)", "Declined"] };
  const [color, label] = map[status] || map.pending;
  return <span style={{ fontSize: 11.5, fontWeight: 700, color, border: `1px solid ${color}`, borderRadius: 20, padding: "3px 9px" }}>{label}</span>;
}

/* ---------- team admin ---------- */

function TeamAdmin({ data, onAdd, onSetTarget, onSkillRulesChange, onResetPin, onAssignPattern, onAddPattern }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState(ROLES[0]);
  const [ruleRole, setRuleRole] = useState(ROLES[0]);
  const [ruleMin, setRuleMin] = useState(1);
  const [patternName, setPatternName] = useState("");
  const [patternSeq, setPatternSeq] = useState(["D", "D", "N", "N", "O", "O", "O", "O"]);

  const rules = data.settings.skillRules || [];
  const addRule = () => onSkillRulesChange([...rules, { role: ruleRole, min: Number(ruleMin) || 1 }]);
  const removeRule = (i) => onSkillRulesChange(rules.filter((_, idx) => idx !== i));

  const toggleCode = (i) => {
    const codes = ["D", "N", "O"];
    const next = [...patternSeq];
    next[i] = codes[(codes.indexOf(next[i]) + 1) % codes.length];
    setPatternSeq(next);
  };

  return (
    <div>
      <h1 style={{ fontFamily: "var(--font-head)", fontSize: 30, margin: "0 0 16px" }}>Team & settings</h1>

      <div style={panelStyle}>
        <div style={panelTitle}>Coverage target</div>
        <div style={{ fontSize: 13, color: "var(--slate)", marginBottom: 8 }}>Crew required per day/night shift</div>
        <input type="number" min={1} value={data.settings.targetPerShift} onChange={(e) => onSetTarget(Math.max(1, Number(e.target.value) || 1))} style={{ ...inputStyle, width: 80 }} />
      </div>

      <div style={panelStyle}>
        <div style={panelTitle}>Skill-mix rules</div>
        <div style={{ fontSize: 13, color: "var(--slate)", marginBottom: 10 }}>Minimum staff of a given role required on every shift</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {rules.map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 6, fontSize: 13.5 }}>
              <span>At least <strong>{r.min}</strong> {r.role}{r.min > 1 ? "s" : ""}</span>
              <button onClick={() => removeRule(i)} style={{ background: "none", border: "none", display: "flex" }}><X size={14} color="var(--slate)" /></button>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={ruleRole} onChange={(e) => setRuleRole(e.target.value)} style={inputStyle}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
          <input type="number" min={1} value={ruleMin} onChange={(e) => setRuleMin(e.target.value)} style={{ ...inputStyle, width: 70 }} />
          <button onClick={addRule} style={{ background: "var(--signal-green)", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontWeight: 600 }}>Add rule</button>
        </div>
      </div>

      <div style={panelStyle}>
        <div style={panelTitle}>Shift patterns</div>
        <div style={{ fontSize: 13, color: "var(--slate)", marginBottom: 10 }}>Reusable rota templates. Click a day below to cycle Day / Night / Off.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {data.patterns.map((p) => (
            <div key={p.id} style={{ padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, fontSize: 13 }}>
              <strong>{p.name}</strong>
              <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                {p.sequence.map((c, i) => <span key={i} style={patternChip(c)}>{c}</span>)}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
          {patternSeq.map((c, i) => (
            <button key={i} onClick={() => toggleCode(i)} style={{ ...patternChip(c), border: "1px solid var(--line)" }}>{c}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input placeholder="Pattern name" value={patternName} onChange={(e) => setPatternName(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
          <button onClick={() => { if (patternName.trim()) { onAddPattern(patternName.trim(), patternSeq); setPatternName(""); } }} style={{ background: "var(--signal-green)", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontWeight: 600 }}>Save pattern</button>
        </div>
      </div>

      <div style={panelStyle}>
        <div style={panelTitle}>Add crew member</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 160 }} />
          <select value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
          <button onClick={() => { if (name.trim()) { onAdd(name.trim(), role); setName(""); } }} style={{ background: "var(--signal-green)", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontWeight: 600 }}>Add</button>
        </div>
        <div style={{ fontSize: 11.5, color: "var(--slate)", marginTop: 6 }}>Added via this panel signs in and sets their own password on first login.</div>
      </div>

      <div style={panelStyle}>
        <div style={{ ...panelTitle, display: "flex", alignItems: "center", gap: 6 }}><Users size={16} /> Directory ({data.staff.length})</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data.staff.map((s) => (
            <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 0.8fr 1.2fr auto", gap: 8, alignItems: "center", padding: "7px 4px", borderBottom: "1px solid var(--line)", fontSize: 13 }}>
              <span>{s.name}</span>
              <span style={{ color: "var(--slate)" }}>{s.role}</span>
              <PatternPicker data={data} staff={s} onAssignPattern={onAssignPattern} />
              <button onClick={() => onResetPin(s.id)} style={{ fontSize: 11.5, color: "var(--slate)", background: "none", border: "1px solid var(--line)", borderRadius: 5, padding: "4px 8px" }} disabled={!s.hasPassword}>
                {s.hasPassword ? "Reset password" : "No password set"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
const panelStyle = { background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: 16, marginBottom: 18 };
const panelTitle = { fontWeight: 600, fontSize: 14.5, marginBottom: 8 };
const patternChip = (c) => ({
  width: 26, height: 26, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700,
  background: c === "D" ? "#EAF4EE" : c === "N" ? "var(--ink)" : "#F2F1EC", color: c === "N" ? "#fff" : "var(--ink)", border: "none",
});

function PatternPicker({ data, staff, onAssignPattern }) {
  const [anchor, setAnchor] = useState(staff.patternAnchor || toISODate(new Date()));
  return (
    <div style={{ display: "flex", gap: 4 }}>
      <select value={staff.patternId || ""} onChange={(e) => onAssignPattern(staff.id, e.target.value || null, anchor)} style={{ ...inputStyle, fontSize: 12, padding: "5px 6px" }}>
        <option value="">No pattern</option>
        {data.patterns.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {staff.patternId && (
        <input type="date" value={anchor} onChange={(e) => { setAnchor(e.target.value); onAssignPattern(staff.id, staff.patternId, e.target.value); }} style={{ ...inputStyle, fontSize: 12, padding: "5px 6px" }} />
      )}
    </div>
  );
}

/* ---------- print sheet ---------- */

function PrintSheet({ data, dates }) {
  return (
    <div className="print-only" style={{ padding: 24, fontFamily: "var(--font-body)", color: "#000" }}>
      <h1 style={{ fontFamily: "var(--font-head)", fontSize: 24, marginBottom: 4 }}>Duty roster</h1>
      <div style={{ fontSize: 13, marginBottom: 16 }}>{fmtRange(dates[0], dates[6])}</div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr><th style={printTh}>Date</th><th style={printTh}>Shift</th><th style={printTh}>Staff</th><th style={printTh}>Role</th></tr>
        </thead>
        <tbody>
          {dates.flatMap((d) => {
            const iso = toISODate(d);
            return ["day", "night"].flatMap((shiftKey) =>
              data.entries.filter((e) => e.date === iso && e.shift === shiftKey).map((e) => {
                const s = data.staff.find((x) => x.id === e.staffId);
                if (!s) return null;
                return (
                  <tr key={e.id}>
                    <td style={printTd}>{fmtDay(d)}</td>
                    <td style={printTd}>{SHIFTS[shiftKey].label}</td>
                    <td style={printTd}>{s.name}</td>
                    <td style={printTd}>{s.role}</td>
                  </tr>
                );
              })
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
const printTh = { textAlign: "left", borderBottom: "1.5px solid #000", padding: "4px 8px" };
const printTd = { borderBottom: "1px solid #999", padding: "4px 8px" };
