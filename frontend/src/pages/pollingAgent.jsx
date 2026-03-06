import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart3, Users, TrendingUp, RefreshCw, LogOut, Activity, Award } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar,
  AreaChart, Area,
} from "recharts";
import { api } from "../services/api";
import { AlertModal } from "../components/Modal";
import { ToastContainer } from "../components/Toast";
import { useModal } from "../hooks/useModal";
import { useToast } from "../hooks/useToast";

const API_BASE_URL = process.env.REACT_APP_API_URL || "/api";

const PALETTE = [
  "#10b981", "#3b82f6", "#f59e0b", "#ef4444",
  "#8b5cf6", "#06b6d4", "#f97316", "#ec4899",
  "#14b8a6", "#6366f1",
];

// ---------------------------------------------------------------------------
// Stream status badge
// ---------------------------------------------------------------------------
const StreamStatus = ({ connected }) => (
  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${connected
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-red-50 text-red-600 border-red-200"
    }`}>
    <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
    {connected ? "Live" : "Reconnecting…"}
  </span>
);

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------
const StatCard = ({ label, value, sub, color, icon, delay = 0 }) => (
  <div
    className="relative bg-white rounded-2xl p-5 overflow-hidden shadow-sm border border-gray-100"
    style={{ animation: `fadeUp 0.5s ease both`, animationDelay: `${delay}ms` }}
  >
    <div className="absolute inset-0 opacity-5" style={{ background: color }} />
    <div className="relative">
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-xl" style={{ background: `${color}18` }}>
          <div style={{ color }}>{icon}</div>
        </div>
      </div>
      <p className="text-3xl font-bold text-gray-900 leading-none mb-1" style={{ fontFamily: "'DM Mono', monospace" }}>
        {value}
      </p>
      <p className="text-sm font-semibold text-gray-500">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Turnout radial gauge
// ---------------------------------------------------------------------------
const TurnoutGauge = ({ percentage }) => {
  const pct = Math.min(100, Math.max(0, percentage || 0));
  const data = [{ value: pct, fill: "#10b981" }];
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col items-center justify-center">
      <p className="text-sm font-semibold text-gray-500 mb-2">Voter Turnout</p>
      <div className="relative">
        <RadialBarChart width={160} height={160} cx={80} cy={80} innerRadius={50} outerRadius={72}
          barSize={14} data={data} startAngle={210} endAngle={-30}>
          <RadialBar background={{ fill: "#f1f5f9" }} dataKey="value" cornerRadius={8} />
        </RadialBarChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-gray-900" style={{ fontFamily: "'DM Mono', monospace" }}>
            {pct.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Custom Pie tooltip
// ---------------------------------------------------------------------------
const PieTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-gray-900 text-white text-xs rounded-xl px-3 py-2 shadow-xl">
      <p className="font-semibold mb-1">{d.name}</p>
      <p style={{ color: d.payload.fill }}>
        Votes: <strong>{d.value?.toLocaleString()}</strong>
      </p>
      <p className="text-gray-400">{d.payload.pct?.toFixed(1)}%</p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Overall vote-share donut (replaces PortfolioBarChart)
// ---------------------------------------------------------------------------
const VoteShareDonut = ({ results }) => {
  const total = results.reduce((s, r) => s + (r.total_votes || 0) + (r.total_rejected || 0), 0);
  const data = results.map((r, i) => {
    const votes = (r.total_votes || 0) + (r.total_rejected || 0);
    return {
      name: r.portfolio_name || r.name || `Portfolio ${r.portfolio_id}`,
      value: votes,
      pct: total ? (votes / total) * 100 : 0,
      fill: PALETTE[i % PALETTE.length],
    };
  });

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-widest mb-5">
        Portfolio Vote Distribution
      </h3>
      <div className="flex flex-col md:flex-row items-center gap-6">
        {/* Donut */}
        <div className="flex-shrink-0">
          <ResponsiveContainer width={220} height={220}>
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-3 w-full">
          {data.map((d, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.fill }} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium text-gray-700 truncate">{d.name}</span>
                  <span className="font-semibold ml-2 flex-shrink-0" style={{ color: d.fill }}>
                    {d.value.toLocaleString()}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${d.pct}%`, background: d.fill }}
                  />
                </div>
              </div>
              <span className="text-xs text-gray-400 w-10 text-right flex-shrink-0">
                {d.pct.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Individual portfolio vote card with mini area sparkline
// ---------------------------------------------------------------------------
const PortfolioVoteCard = ({ portfolio, index, totalAllVotes }) => {
  const color = PALETTE[index % PALETTE.length];
  const totalVotes = (portfolio.total_votes || 0) + (portfolio.total_rejected || 0);
  const sharePct = totalAllVotes ? ((totalVotes / totalAllVotes) * 100) : 0;

  // Sparkline shape
  const sparkData = [
    { v: 0 }, { v: Math.round(totalVotes * 0.2) },
    { v: Math.round(totalVotes * 0.5) }, { v: Math.round(totalVotes * 0.75) },
    { v: totalVotes },
  ];

  // Mini donut: this portfolio vs rest
  const miniData = [
    { value: totalVotes, fill: color },
    { value: Math.max(totalAllVotes - totalVotes, 0.001), fill: "#e2e8f0" },
  ];

  return (
    <div
      className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 flex flex-col"
      style={{ animation: `fadeUp 0.5s ease both`, animationDelay: `${index * 80}ms` }}
    >
      {/* Color accent bar */}
      <div className="h-1.5 w-full" style={{ background: color }} />

      <div className="p-5 flex-1 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest mb-0.5" style={{ color }}>
              Portfolio {index + 1}
            </p>
            <h4 className="text-sm font-bold text-gray-800 leading-snug">
              {portfolio.portfolio_name || portfolio.name || `Portfolio ${portfolio.portfolio_id}`}
            </h4>
          </div>
          {/* Mini donut — share vs rest */}
          <div className="flex-shrink-0">
            <PieChart width={52} height={52}>
              <Pie data={miniData} cx={26} cy={26} innerRadius={16} outerRadius={24}
                dataKey="value" strokeWidth={0} paddingAngle={2}>
                {miniData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
            </PieChart>
          </div>
        </div>

        {/* Big vote number */}
        <div className="text-center py-1">
          <p className="text-4xl font-black text-gray-900 leading-none" style={{ fontFamily: "'DM Mono', monospace" }}>
            {totalVotes.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 mt-1 font-medium">votes</p>
        </div>

        {/* Sparkline */}
        <div className="h-14 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2}
                fill={`url(#grad-${index})`} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Share bar */}
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span className="font-semibold">Share of all votes</span>
            <span className="font-bold" style={{ color }}>{sharePct.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${sharePct}%`, background: color }} />
          </div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Portfolio cards grid
// ---------------------------------------------------------------------------
const PortfolioCardsGrid = ({ results }) => {
  const totalAllVotes = results.reduce(
    (s, r) => s + (r.total_votes || 0) + (r.total_rejected || 0), 0
  );

  // Find leading portfolio
  const leading = results.reduce((best, r) => {
    const votes = (r.total_votes || 0) + (r.total_rejected || 0);
    return votes > ((best?.total_votes || 0) + (best?.total_rejected || 0)) ? r : best;
  }, null);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-widest">
          Votes per Portfolio
        </h3>
        {leading && (
          <div className="flex items-center gap-1.5 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-full">
            <Award className="h-3.5 w-3.5" />
            Leading: {leading.portfolio_name || leading.name}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {results.map((r, i) => (
          <PortfolioVoteCard
            key={r.portfolio_id ?? i}
            portfolio={r}
            index={i}
            totalAllVotes={totalAllVotes}
          />
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Dashboard — SSE-powered
// ---------------------------------------------------------------------------
const PollingAgentDashboard = ({ agent, onLogout }) => {
  const [stats, setStats] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [streamsConnected, setStreamsConnected] = useState(false);
  const [activeElection, setActiveElection] = useState(null);

  const resultsStreamRef = useRef(null);
  const statsStreamRef = useRef(null);
  const connectedStreams = useRef(new Set());

  const alertModal = useModal();
  const toast = useToast();

  const markConnected = useCallback((streamName) => {
    connectedStreams.current.add(streamName);
    if (connectedStreams.current.size >= 2) {
      setStreamsConnected(true);
      setLoading(false);
    }
  }, []);

  const closeStreams = useCallback(() => {
    resultsStreamRef.current?.close();
    statsStreamRef.current?.close();
    resultsStreamRef.current = null;
    statsStreamRef.current = null;
    connectedStreams.current.clear();
  }, []);

  const loadAndSetActiveElection = useCallback(async () => {
    try {
      const data = await api.getElections().catch(() => []);
      const list = Array.isArray(data) ? data : [];
      if (!list.length) return null;
      const priority = ["OPEN", "READY", "DRAFT", "CLOSED", "PUBLISHED"];
      let chosen = null;
      for (const status of priority) {
        chosen = list.find((e) => e.status === status);
        if (chosen) break;
      }
      if (!chosen) chosen = list[0];
      api.setActiveElectionId(chosen.id);
      setActiveElection(chosen);
      return chosen;
    } catch { return null; }
  }, []);

  const openStreams = useCallback(() => {
    closeStreams();
    setStreamsConnected(false);
    resultsStreamRef.current = api.streamResults(
      (data) => { setResults(data); setLastUpdate(new Date()); markConnected("results"); },
      (err) => { console.error("[SSE] Results:", err); setStreamsConnected(false); }
    );
    statsStreamRef.current = api.streamStatistics(
      (data) => { setStats(data); setLastUpdate(new Date()); markConnected("stats"); },
      (err) => { console.error("[SSE] Stats:", err); setStreamsConnected(false); }
    );
  }, [closeStreams, markConnected]);

  useEffect(() => {
    const init = async () => {
      if (!api.getActiveElectionId()) {
        const chosen = await loadAndSetActiveElection();
        if (!chosen) { setLoading(false); return; }
      } else {
        await loadAndSetActiveElection();
      }
      openStreams();
    };
    init();
    return closeStreams;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleManualRefresh = useCallback(async () => {
    setLoading(true);
    await loadAndSetActiveElection();
    openStreams();
  }, [loadAndSetActiveElection, openStreams]);

  const votingStats = stats?.voting || {};
  const turnoutPct = votingStats?.voting_percentage || 0;
  const totalVoted = votingStats?.voted_electorates || 0;
  const totalVoters = votingStats?.total_electorates || 0;
  const totalVotes = votingStats?.total_votes || 0;

  const electionLogoUrl = activeElection?.logo_url
    ? activeElection.logo_url.startsWith("http")
      ? activeElection.logo_url
      : `${API_BASE_URL.replace(/\/api$/, "")}${activeElection.logo_url}`
    : null;

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
      <AlertModal {...alertModal} onClose={alertModal.handleClose} {...alertModal.modalProps} />

      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              {electionLogoUrl ? (
                <img src={electionLogoUrl} alt="logo"
                  className="h-10 w-10 object-contain rounded-xl border border-gray-100 shadow-sm" />
              ) : (
                <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-lg border border-emerald-200">
                  {activeElection?.name?.[0] ?? "K"}
                </div>
              )}
              <div>
                <h1 className="text-base font-bold text-gray-900 leading-tight">
                  {activeElection?.name ?? "Election"}{" "}
                  <span className="text-gray-400 font-normal text-sm">· Live Results</span>
                </h1>
                <p className="text-xs text-gray-500">
                  {agent?.username}
                  <span className="ml-2 text-emerald-600 font-semibold">
                    {agent?.role === "admin" ? "Admin" : "Polling Agent"}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <StreamStatus connected={streamsConnected} />
              <button onClick={handleManualRefresh} disabled={loading}
                className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-40"
                title="Reconnect">
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button onClick={onLogout}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
                <LogOut className="h-4 w-4" /> Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Stat cards + turnout gauge */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard label="Total Votes Cast" value={totalVotes.toLocaleString()} color="#10b981"
            icon={<Activity className="h-5 w-5" />} delay={0} />
          <StatCard label="Registered Voters" value={totalVoters.toLocaleString()} color="#3b82f6"
            icon={<Users className="h-5 w-5" />} delay={60} />
          <StatCard label="Have Voted" value={totalVoted.toLocaleString()}
            sub={`${(totalVoters - totalVoted).toLocaleString()} remaining`}
            color="#8b5cf6" icon={<TrendingUp className="h-5 w-5" />} delay={120} />
          <StatCard label="Portfolios" value={(results?.length || 0).toString()} color="#f59e0b"
            icon={<BarChart3 className="h-5 w-5" />} delay={180} />
          <div className="col-span-2 lg:col-span-1" style={{ animation: `fadeUp 0.5s ease both`, animationDelay: "240ms" }}>
            <TurnoutGauge percentage={turnoutPct} />
          </div>
        </div>

        {/* Loading */}
        {loading && !results && (
          <div className="bg-white rounded-2xl p-16 text-center shadow-sm border border-gray-100">
            <RefreshCw className="h-10 w-10 text-emerald-500 animate-spin mx-auto mb-4" />
            <p className="text-gray-500 font-medium">Connecting to live results stream…</p>
          </div>
        )}

        {/* Main content — donut overview + per-portfolio cards */}
        {!loading && results && results.length > 0 && (
          <>
            {/* Vote share donut */}
            <div style={{ animation: `fadeUp 0.5s ease both`, animationDelay: "100ms" }}>
              <VoteShareDonut results={results} />
            </div>

            {/* Per-portfolio vote cards */}
            <div style={{ animation: `fadeUp 0.5s ease both`, animationDelay: "200ms" }}>
              <PortfolioCardsGrid results={results} />
            </div>
          </>
        )}

        {/* No results */}
        {!loading && (!results || results.length === 0) && (
          <div className="bg-white rounded-2xl p-16 text-center shadow-sm border border-gray-100">
            <BarChart3 className="h-12 w-12 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-400 font-medium">No results available yet</p>
            <p className="text-gray-300 text-sm mt-1">Results will appear here once voting begins</p>
          </div>
        )}

        <div className="text-center pb-4">
          <p className="text-xs text-gray-400">
            Last updated {lastUpdate.toLocaleTimeString()}
            {!streamsConnected && " · Disconnected — trying to reconnect…"}
          </p>
        </div>
      </main>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
const PollingAgentLogin = ({ onLogin, alertModal }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!username || !password) {
      alertModal.showAlert({ title: "Error", message: "Please enter username and password", type: "error" });
      return;
    }
    setLoading(true);
    try {
      const data = await api.login(username, password);
      if (data.role === "polling_agent" || data.role === "admin") {
        localStorage.setItem("admin_token", data.access_token);
        onLogin(data);
      } else {
        throw new Error(`Access denied. This portal is for Polling Agents only. You are logged in as ${data.role}.`);
      }
    } catch (err) {
      alertModal.showAlert({ title: "Login Failed", message: err.message || "Invalid credentials", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{
        fontFamily: "'DM Sans', sans-serif",
        background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 40%, #a7f3d0 100%)"
      }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');`}</style>
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md border border-emerald-100">
        <div className="text-center mb-8">
          <div className="inline-flex p-4 bg-emerald-100 rounded-2xl mb-4">
            <BarChart3 className="h-10 w-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Live Results Portal</h1>
          <p className="text-gray-500 mt-1 text-sm">Polling Agent Access</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-0 focus:border-emerald-400 transition-colors text-sm"
              placeholder="Enter username" required />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl focus:ring-0 focus:border-emerald-400 transition-colors text-sm"
              placeholder="Enter password" required />
          </div>
          <button type="submit" disabled={loading}
            className="w-full bg-emerald-600 text-white py-3 rounded-xl hover:bg-emerald-700 disabled:opacity-50 font-semibold transition-colors mt-2 text-sm">
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Root — auth gate
// ---------------------------------------------------------------------------
export default function PollingAgentPortal() {
  const navigate = useNavigate();
  const [agent, setAgent] = useState(null);
  const [loading, setLoading] = useState(true);
  const alertModal = useModal();

  const checkAuth = useCallback(async () => {
    const token = localStorage.getItem("admin_token");
    if (!token) { setLoading(false); return; }
    try {
      const data = await api.verify();
      if (data.role === "polling_agent" || data.role === "admin") {
        setAgent(data);
      } else {
        const correctRoute = api.getRoleBasedRoute(data.role);
        localStorage.removeItem("admin_token");
        await alertModal.showAlert({
          title: "Access Denied",
          message: `This page is for Polling Agents only. Redirecting to ${data.role} portal…`,
          type: "error",
        });
        setTimeout(() => navigate(correctRoute), 2000);
        return;
      }
    } catch (err) {
      console.error("Auth check failed:", err);
      localStorage.removeItem("admin_token");
      await alertModal.showAlert({
        title: "Access Denied",
        message: err.message || "You don't have permission to access this portal",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [alertModal, navigate]);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const handleLogin = (data) => {
    if (data.role === "polling_agent" || data.role === "admin") {
      setAgent(data);
    } else {
      const correctRoute = api.getRoleBasedRoute(data.role);
      alertModal.showAlert({ title: "Wrong Portal", message: `You are logged in as ${data.role}. Redirecting…`, type: "info" });
      setTimeout(() => navigate(correctRoute), 2000);
      localStorage.removeItem("admin_token");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    api.setActiveElectionId(null);
    setAgent(null);
    navigate("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <RefreshCw className="h-10 w-10 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!agent) {
    return (
      <>
        <AlertModal {...alertModal} onClose={alertModal.handleClose} {...alertModal.modalProps} />
        <PollingAgentLogin onLogin={handleLogin} alertModal={alertModal} />
      </>
    );
  }

  return <PollingAgentDashboard agent={agent} onLogout={handleLogout} />;
}