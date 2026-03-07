import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart3, Users, TrendingUp, RefreshCw, LogOut, Wifi, WifiOff, Trophy, Shield, Activity, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/api";
import { AlertModal } from "../components/Modal";
import { ToastContainer } from "../components/Toast";
import { useModal } from "../hooks/useModal";
import { useToast } from "../hooks/useToast";

const API_BASE_URL = process.env.REACT_APP_API_URL || "/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const getImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return `${API_BASE_URL.replace(/\/api$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
};

// ---------------------------------------------------------------------------
// Donut chart (SVG)
// ---------------------------------------------------------------------------
const Donut = ({ voted, total, size = 72 }) => {
  const pct = total > 0 ? (voted / total) * 100 : 0;
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)', flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e8e5ff" strokeWidth={8} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#7c3aed" strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1)' }} />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Portfolio card — shows ONLY portfolio name + total votes (no candidate breakdown)
// total_votes already includes all votes cast (valid + rejected) from the API
// ---------------------------------------------------------------------------
const PortfolioCard = ({ result, idx }) => {
  const totalVotes = result.total_votes || 0;
  const hasVotes = totalVotes > 0;

  return (
    <div className="pa-port-card" style={{ animationDelay: `${idx * 60}ms` }}>
      <div className="pa-port-label">{result.portfolio_name}</div>
      <div className="pa-port-vote-display">
        <span className="pa-port-vote-number">{totalVotes.toLocaleString()}</span>
        <span className="pa-port-vote-word">vote{totalVotes !== 1 ? 's' : ''}</span>
      </div>
      {!hasVotes && <div className="pa-no-votes">No votes yet</div>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Turnout gauge
// ---------------------------------------------------------------------------
const TurnoutGauge = ({ voted, total }) => {
  const pct = total > 0 ? +((voted / total) * 100).toFixed(1) : 0;
  return (
    <div className="pa-gauge">
      <div className="pa-gauge-ring">
        <Donut voted={voted} total={total} size={88} />
        <div className="pa-gauge-center">
          <span className="pa-gauge-pct">{pct}%</span>
        </div>
      </div>
      <div>
        <div className="pa-gauge-label">Voter Turnout</div>
        <div className="pa-gauge-sub">{voted.toLocaleString()} of {total.toLocaleString()}</div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Live activity bar chart
// ---------------------------------------------------------------------------
const ActivityChart = ({ history }) => {
  const max = Math.max(...history, 1);
  return (
    <div className="pa-activity">
      <div className="pa-activity-label"><Activity size={11} /> Live Activity</div>
      <div className="pa-activity-bars">
        {history.map((v, i) => (
          <div key={i} className="pa-activity-col">
            <div className="pa-activity-bar"
              style={{ height: `${(v / max) * 100}%`, opacity: 0.3 + (i / history.length) * 0.7 }} />
          </div>
        ))}
      </div>
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
// Dashboard
// ---------------------------------------------------------------------------
const Dashboard = ({ agent, onLogout }) => {
  const [stats, setStats] = useState(null);
  const [results, setResults] = useState([]);
  const [activeElection, setActiveElection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [streamsConnected, setStreamsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [activityHistory, setActivityHistory] = useState(Array(12).fill(0));

  const resultsStreamRef = useRef(null);
  const statsStreamRef = useRef(null);
  const connectedCountRef = useRef(0);
  const prevVotesRef = useRef(0);
  const toast = useToast();
  const alertModalRef = useRef(useModal());
  const alertModal = alertModalRef.current;

  useEffect(() => {
    api.getElections().then(d => {
      const list = Array.isArray(d) ? d : [];
      setActiveElection(list.find(e => e.is_active) ?? list[0] ?? null);
    }).catch(() => { });
  }, []);

  const markConnected = useCallback(() => {
    connectedCountRef.current += 1;
    if (connectedCountRef.current >= 2) { setStreamsConnected(true); setLoading(false); }
  }, []);

  const closeStreams = useCallback(() => {
    resultsStreamRef.current?.close(); resultsStreamRef.current = null;
    statsStreamRef.current?.close(); statsStreamRef.current = null;
    connectedCountRef.current = 0;
  }, []);

  const openStreams = useCallback(() => {
    closeStreams();
    setStreamsConnected(false);

    resultsStreamRef.current = api.streamResults(data => {
      setResults(Array.isArray(data) ? data : []);
      setLastUpdate(new Date());
      if (connectedCountRef.current < 1) markConnected();
    }, () => setStreamsConnected(false));

    statsStreamRef.current = api.streamStatistics(data => {
      setStats(data);
      setLastUpdate(new Date());
      const newTotal = data?.voting?.total_votes || 0;
      setActivityHistory(prev => {
        const delta = Math.max(0, newTotal - prevVotesRef.current);
        prevVotesRef.current = newTotal;
        return [...prev.slice(1), delta];
      });
      if (connectedCountRef.current < 2) markConnected();
    }, () => setStreamsConnected(false));
  }, [closeStreams, markConnected]);

  useEffect(() => { openStreams(); return closeStreams; }, [openStreams, closeStreams]);

  const voting = stats?.voting || {};
  const totalVotes = voting.total_votes || 0;
  const totalVoters = voting.total_electorates || 0;
  const votedCount = voting.voted_electorates || 0;

  const logoUrl = activeElection?.logo_url
    ? activeElection.logo_url.startsWith('http')
      ? activeElection.logo_url
      : `${API_BASE_URL.replace(/\/api$/, '')}${activeElection.logo_url.startsWith('/') ? '' : '/'}${activeElection.logo_url}`
    : null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@500;700&display=swap');
        * { box-sizing: border-box; }

        .pa-root {
          font-family: 'DM Sans', sans-serif;
          background: #f8f7ff;
          color: #1e1b4b;
          height: 100vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .pa-topbar {
          display: flex; align-items: center; gap: 16px;
          padding: 0 20px; height: 56px;
          background: #ffffff; border-bottom: 1px solid #e8e5ff;
          flex-shrink: 0;
        }
        .pa-topbar-brand {
          display: flex; align-items: center; gap: 10px;
          font-family: 'Syne', sans-serif;
          font-size: 15px; font-weight: 700; color: #1e1b4b; flex-shrink: 0;
        }
        .pa-topbar-logo {
          height: 32px; width: 32px; border-radius: 8px; object-fit: contain;
          border: 1px solid #e8e5ff; background: #f5f3ff;
        }
        .pa-topbar-logo-fallback {
          height: 32px; width: 32px; border-radius: 8px;
          background: linear-gradient(135deg,#7c3aed,#6d28d9);
          display: flex; align-items: center; justify-content: center;
        }
        .pa-topbar-divider { width: 1px; height: 24px; background: #e8e5ff; }
        .pa-topbar-elec {
          font-size: 12px; color: #7c6fcd;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;
        }
        .pa-stream-badge {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 600;
          padding: 3px 9px; border-radius: 20px; flex-shrink: 0;
        }
        .pa-stream-badge--on  { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
        .pa-stream-badge--off { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
        .pa-stream-dot { width: 6px; height: 6px; border-radius: 50%; }
        .pa-stream-dot--on  { background: #4ade80; animation: pa-blink 1.4s infinite; }
        .pa-stream-dot--off { background: #f87171; }
        @keyframes pa-blink { 0%,100%{opacity:1} 50%{opacity:.2} }
        .pa-topbar-right { margin-left: auto; display: flex; align-items: center; gap: 10px; }
        .pa-topbar-time { font-family: 'JetBrains Mono',monospace; font-size: 11px; color: #9ca3af; }
        .pa-icon-btn {
          width: 32px; height: 32px;
          background: transparent; border: 1px solid #e8e5ff;
          border-radius: 8px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: #7c6fcd; transition: all .2s;
        }
        .pa-icon-btn:hover { background: #ede9fe; color: #6b7280; }
        .pa-logout-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 0 14px; height: 32px;
          background: #dc2626; border: none; border-radius: 8px; cursor: pointer;
          color: #fff; font-size: 12px; font-weight: 600;
          font-family: 'DM Sans',sans-serif; transition: all .2s;
        }
        .pa-logout-btn:hover { background: #b91c1c; }

        .pa-body { display: flex; flex: 1; overflow: hidden; }

        .pa-sidebar {
          width: 220px; flex-shrink: 0;
          background: #ffffff; border-right: 1px solid #e8e5ff;
          display: flex; flex-direction: column;
          overflow: hidden; padding: 16px 14px; gap: 12px;
        }
        .pa-stat-tile {
          background: #f5f3ff; border: 1px solid #e8e5ff;
          border-radius: 12px; padding: 12px 14px;
        }
        .pa-stat-tile-label {
          font-size: 9px; font-weight: 700;
          text-transform: uppercase; letter-spacing: .1em;
          color: #9ca3af; margin-bottom: 4px;
        }
        .pa-stat-tile-value {
          font-family: 'JetBrains Mono',monospace;
          font-size: 26px; font-weight: 700; color: #1e1b4b; line-height: 1;
        }
        .pa-stat-tile-sub { font-size: 10px; color: #9ca3af; margin-top: 3px; }

        .pa-gauge {
          display: flex; align-items: center; gap: 12px;
          background: #f5f3ff; border: 1px solid #e8e5ff;
          border-radius: 12px; padding: 12px 14px;
        }
        .pa-gauge-ring { position: relative; flex-shrink: 0; }
        .pa-gauge-center { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
        .pa-gauge-pct { font-family: 'JetBrains Mono',monospace; font-size: 14px; font-weight: 700; color: #7c3aed; }
        .pa-gauge-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #9ca3af; }
        .pa-gauge-sub { font-size: 11px; color: #6b7280; margin-top: 2px; }

        .pa-activity {
          background: #f5f3ff; border: 1px solid #e8e5ff;
          border-radius: 12px; padding: 12px 14px;
          flex: 1; display: flex; flex-direction: column; min-height: 0;
        }
        .pa-activity-label {
          display: flex; align-items: center; gap: 5px;
          font-size: 9px; font-weight: 700;
          text-transform: uppercase; letter-spacing: .1em;
          color: #9ca3af; margin-bottom: 8px;
        }
        .pa-activity-bars { flex: 1; display: flex; align-items: flex-end; gap: 3px; min-height: 0; }
        .pa-activity-col { flex: 1; height: 100%; display: flex; align-items: flex-end; }
        .pa-activity-bar {
          width: 100%; background: #7c3aed; border-radius: 3px 3px 0 0;
          min-height: 2px; transition: height .6s ease;
        }

        .pa-main {
          flex: 1; overflow: hidden; padding: 14px;
          display: flex; flex-direction: column; gap: 10px; min-width: 0;
        }
        .pa-main-header {
          display: flex; align-items: center; justify-content: space-between; flex-shrink: 0;
        }
        .pa-main-title { font-family: 'Syne',sans-serif; font-size: 16px; font-weight: 700; color: #1e1b4b; }
        .pa-main-sub { font-size: 11px; color: #9ca3af; }

        .pa-ports-grid {
          flex: 1;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 10px;
          overflow: auto;
          align-content: start;
          scrollbar-width: none;
        }
        .pa-ports-grid::-webkit-scrollbar { display: none; }

        /* ── Portfolio card: clean votes-only tile ── */
        .pa-port-card {
          background: #ffffff;
          border: 1.5px solid #e8e5ff;
          border-radius: 14px;
          padding: 16px 12px 14px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          animation: pa-fade .4s ease-out both;
          transition: border-color .2s, box-shadow .2s;
          cursor: default;
          text-align: center;
        }
        .pa-port-card:hover {
          border-color: #c4b5fd;
          box-shadow: 0 4px 20px rgba(124,58,237,.1);
        }
        @keyframes pa-fade { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }

        .pa-port-label {
          font-family: 'Syne',sans-serif;
          font-size: 10px; font-weight: 700;
          color: #7c6fcd;
          text-transform: uppercase; letter-spacing: .07em;
          line-height: 1.4;
          width: 100%;
          margin-bottom: 12px;
        }

        .pa-port-vote-display {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 3px;
          padding: 12px 0 10px;
          width: 100%;
          border-top: 1px solid #f3f0ff;
        }
        .pa-port-vote-number {
          font-family: 'JetBrains Mono', monospace;
          font-size: 38px;
          font-weight: 700;
          color: #7c3aed;
          line-height: 1;
        }
        .pa-port-vote-word {
          font-size: 10px; font-weight: 600;
          color: #a78bfa;
          text-transform: uppercase; letter-spacing: .1em;
        }

        .pa-no-votes {
          font-size: 9px; color: #c4b5fd;
          margin-top: 6px; font-style: italic;
        }

        .pa-loading {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 12px; color: #9ca3af;
        }
        .pa-loading-title { font-family: 'Syne',sans-serif; font-size: 14px; color: #7c6fcd; }
      `}</style>

      <div className="pa-root">
        <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />
        <AlertModal {...alertModal} onClose={alertModal.handleClose} {...alertModal.modalProps} />

        {/* Topbar */}
        <div className="pa-topbar">
          <div className="pa-topbar-brand">
            {logoUrl
              ? <img src={logoUrl} alt="Election" className="pa-topbar-logo" onError={e => e.target.style.display = 'none'} />
              : <div className="pa-topbar-logo-fallback"><BarChart3 size={16} color="#7dd3fc" /></div>
            }
            {activeElection?.name || 'Election Portal'}
          </div>
          <div className="pa-topbar-divider" />
          <span className="pa-topbar-elec">Live Results · Polling Agent</span>
          <div className="pa-topbar-right">
            <div className={`pa-stream-badge ${streamsConnected ? 'pa-stream-badge--on' : 'pa-stream-badge--off'}`}>
              <div className={`pa-stream-dot ${streamsConnected ? 'pa-stream-dot--on' : 'pa-stream-dot--off'}`} />
              {streamsConnected ? 'Live' : 'Connecting…'}
            </div>
            <span className="pa-topbar-time">{lastUpdate.toLocaleTimeString()}</span>
            <button className="pa-icon-btn" onClick={() => { setLoading(true); openStreams(); }} title="Refresh">
              <RefreshCw size={14} className={loading ? 'pa-spin' : ''} />
            </button>
            <button className="pa-logout-btn" onClick={onLogout}>
              <LogOut size={13} /> Logout
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="pa-body">
          <div className="pa-sidebar">
            <div className="pa-stat-tile">
              <div className="pa-stat-tile-label">Total Votes</div>
              <div className="pa-stat-tile-value">{totalVotes.toLocaleString()}</div>
              <div className="pa-stat-tile-sub">votes cast</div>
            </div>
            <div className="pa-stat-tile">
              <div className="pa-stat-tile-label">Registered</div>
              <div className="pa-stat-tile-value">{totalVoters.toLocaleString()}</div>
              <div className="pa-stat-tile-sub">eligible voters</div>
            </div>
            <TurnoutGauge voted={votedCount} total={totalVoters} />
            <div className="pa-stat-tile">
              <div className="pa-stat-tile-label">Portfolios</div>
              <div className="pa-stat-tile-value">{results.length}</div>
              <div className="pa-stat-tile-sub">positions</div>
            </div>
            <div className="pa-stat-tile">
              <div className="pa-stat-tile-label">Remaining</div>
              <div className="pa-stat-tile-value" style={{ color: '#f87171' }}>
                {(totalVoters - votedCount).toLocaleString()}
              </div>
              <div className="pa-stat-tile-sub">yet to vote</div>
            </div>
            <ActivityChart history={activityHistory} />
          </div>

          <div className="pa-main">
            <div className="pa-main-header">
              <div>
                <div className="pa-main-title">Portfolio Results</div>
                <div className="pa-main-sub">{results.length} positions · updates in real time</div>
              </div>
            </div>

            {loading && results.length === 0 ? (
              <div className="pa-loading">
                <RefreshCw size={28} color="#7c3aed" style={{ animation: 'pa-rotate 1s linear infinite' }} />
                <div className="pa-loading-title">Establishing live connection…</div>
              </div>
            ) : (
              <div className="pa-ports-grid">
                {results.map((r, i) => (
                  <PortfolioCard key={r.portfolio_id || i} result={r} idx={i} />
                ))}
                {results.length === 0 && (
                  <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: '#334155' }}>
                    <Trophy size={32} color="#c4b5fd" style={{ margin: '0 auto 12px' }} />
                    <div style={{ fontSize: 13 }}>No results yet. Waiting for votes…</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <style>{`
          @keyframes pa-rotate { from{transform:rotate(0)} to{transform:rotate(360deg)} }
          .pa-spin { animation: pa-rotate .8s linear infinite; }
        `}</style>
      </div>
    </>
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
        localStorage.removeItem("admin_token");
        await alertModal.showAlert({ title: "Access Denied", message: `This page is for Polling Agents only.`, type: "error" });
        setTimeout(() => navigate(api.getRoleBasedRoute(data.role)), 2000);
      }
    } catch (err) {
      localStorage.removeItem("admin_token");
    } finally {
      setLoading(false);
    }
  }, [alertModal, navigate]);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const handleLogin = (data) => {
    if (data.role === "polling_agent" || data.role === "admin") {
      setAgent(data);
    } else {
      alertModal.showAlert({ title: "Wrong Portal", message: `Redirecting to your portal…`, type: "info" });
      setTimeout(() => navigate(api.getRoleBasedRoute(data.role)), 2000);
      localStorage.removeItem("admin_token");
    }
  };

  const handleLogout = () => { localStorage.removeItem("admin_token"); setAgent(null); navigate("/"); };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8f7ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <RefreshCw size={32} color="#7c3aed" style={{ animation: 'pa-rotate 1s linear infinite' }} />
        <style>{`@keyframes pa-rotate{from{transform:rotate(0)}to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!agent) return (
    <>
      <AlertModal {...alertModal} onClose={alertModal.handleClose} {...alertModal.modalProps} />
      <PollingAgentLogin onLogin={handleLogin} alertModal={alertModal} />
    </>
  );

  return <Dashboard agent={agent} onLogout={handleLogout} />;
}