import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ─── shared helpers ────────────────────────────────────────────────────────────

// single fetch wrapper — attaches auth header and throws on non-ok responses
const api = async (path, options = {}, token = null) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'request failed');
  return data;
};

// status -> tailwind badge classes, shared by table rows and the modal
const statusBadgeClass = (status) => {
  const map = {
    OPEN: 'bg-blue-900 text-blue-300',
    ESCALATED: 'bg-red-900 text-red-300',
    'AUTO-CLOSED': 'bg-gray-700 text-gray-300',
    RESOLVED: 'bg-green-900 text-green-300',
  };
  return `px-2 py-0.5 rounded text-xs font-mono ${map[status] || 'bg-gray-700 text-gray-300'}`;
};

const severityTextClass = {
  high: 'text-red-400',
  medium: 'text-yellow-400',
  low: 'text-green-400',
};

// ─── LoginScreen ───────────────────────────────────────────────────────────────

function LoginScreen({ form, setForm, error, onSubmit }) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-sm shadow-2xl border border-gray-800">
        <h1 className="text-white text-xl font-semibold mb-6">moveinsync dashboard</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <input
            className="bg-gray-800 text-white rounded-lg px-4 py-2 text-sm border border-gray-700 focus:outline-none focus:border-indigo-500"
            type="email"
            placeholder="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <input
            className="bg-gray-800 text-white rounded-lg px-4 py-2 text-sm border border-gray-700 focus:outline-none focus:border-indigo-500"
            type="password"
            placeholder="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2 text-sm font-medium transition-colors"
            type="submit"
          >
            sign in
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── StatCards ─────────────────────────────────────────────────────────────────

// one card per severity level from the summary aggregation
function StatCards({ bySeverity }) {
  return (
    <section>
      <h2 className="text-xs text-gray-500 mb-3 uppercase tracking-widest">alerts by severity</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {bySeverity.length > 0 ? (
          bySeverity.map((s) => (
            <div key={s._id} className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex flex-col gap-1">
              <span className={`text-xs uppercase tracking-wider font-medium ${severityTextClass[s._id] || 'text-gray-400'}`}>
                {s._id}
              </span>
              <span className="text-3xl font-bold text-white">{s.count}</span>
            </div>
          ))
        ) : (
          <p className="col-span-6 text-sm text-gray-500">no alerts ingested yet</p>
        )}
      </div>
    </section>
  );
}

// ─── TrendsChart ───────────────────────────────────────────────────────────────

// line chart on the left, top-5 offending drivers on the right
function TrendsChart({ trends, topDrivers }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-xs text-gray-500 mb-4 uppercase tracking-widest">7-day alert trends</h2>
        {trends.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                labelStyle={{ color: '#e5e7eb' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="total"      stroke="#6366f1" strokeWidth={2} dot={false} name="total"       />
              <Line type="monotone" dataKey="escalated"  stroke="#f87171" strokeWidth={2} dot={false} name="escalated"   />
              <Line type="monotone" dataKey="autoClosed" stroke="#6b7280" strokeWidth={2} dot={false} name="auto-closed" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-500 py-10 text-center">no data yet</p>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h2 className="text-xs text-gray-500 mb-4 uppercase tracking-widest">top 5 drivers</h2>
        {topDrivers.length > 0 ? (
          <ol className="flex flex-col gap-3">
            {topDrivers.map((d, i) => (
              <li key={d.driverId} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-gray-600 w-4 shrink-0">{i + 1}.</span>
                  <span className="text-sm text-gray-200 truncate" title={d.driverId}>{d.driverId}</span>
                </div>
                <span className="text-sm font-bold text-red-400 shrink-0">{d.alertCount}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-gray-500 leading-relaxed">
            no driver data — include{' '}
            <code className="text-indigo-400 text-xs">metadata.driverId</code> when ingesting alerts
          </p>
        )}
      </div>
    </div>
  );
}

// ─── RecentAlertsTable ────────────────────────────────────────────────────────

// shows up to 20 recent alerts across all states; collapses to 5 rows by default
function RecentAlertsTable({ alerts, onRowClick }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? alerts : alerts.slice(0, 5);

  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h2 className="text-xs text-gray-500 mb-4 uppercase tracking-widest">recent alert activity</h2>
      {alerts.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                  <th className="pb-2 pr-6 font-normal">alert id</th>
                  <th className="pb-2 pr-6 font-normal">source type</th>
                  <th className="pb-2 pr-6 font-normal">severity</th>
                  <th className="pb-2 pr-6 font-normal">state</th>
                  <th className="pb-2 font-normal">timestamp</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((a) => (
                  <tr
                    key={a._id}
                    className="border-b border-gray-800 hover:bg-gray-800/60 cursor-pointer transition-colors"
                    onClick={() => onRowClick(a)}
                  >
                    <td className="py-2.5 pr-6 font-mono text-indigo-400 text-xs">{a.alertid}</td>
                    <td className="py-2.5 pr-6 text-gray-300">{a.sourceType}</td>
                    <td className={`py-2.5 pr-6 ${severityTextClass[a.severity] || 'text-gray-300'}`}>{a.severity}</td>
                    <td className="py-2.5 pr-6">
                      <span className={statusBadgeClass(a.status)}>{a.status}</span>
                    </td>
                    <td className="py-2.5 text-gray-400 text-xs">{new Date(a.timestamp).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {alerts.length > 5 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              {showAll ? 'show less' : `show all ${alerts.length} alerts`}
            </button>
          )}
        </>
      ) : (
        <p className="text-sm text-gray-500 py-4 text-center">no alerts ingested yet</p>
      )}
    </section>
  );
}

// ─── AlertsTable ───────────────────────────────────────────────────────────────

// auto-closed alerts with a time-range filter
function AlertsTable({ alerts, onRowClick, timeFilter, onTimeFilterChange }) {
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
        <h2 className="text-xs text-gray-500 uppercase tracking-widest">auto-closed alerts</h2>
        <div className="flex gap-2">
          {['24h', '48h', '7d'].map((f) => (
            <button
              key={f}
              onClick={() => onTimeFilterChange(f)}
              className={`text-xs px-3 py-1 rounded-lg transition-colors ${
                timeFilter === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              last {f}
            </button>
          ))}
        </div>
      </div>

      {alerts.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                <th className="pb-2 pr-6 font-normal">alert id</th>
                <th className="pb-2 pr-6 font-normal">source</th>
                <th className="pb-2 pr-6 font-normal">severity</th>
                <th className="pb-2 pr-6 font-normal">timestamp</th>
                <th className="pb-2 font-normal">closure note</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr
                  key={a._id}
                  className="border-b border-gray-800 hover:bg-gray-800/60 cursor-pointer transition-colors"
                  onClick={() => onRowClick(a)}
                >
                  <td className="py-2.5 pr-6 font-mono text-indigo-400 text-xs">{a.alertid}</td>
                  <td className="py-2.5 pr-6 text-gray-300">{a.sourceType}</td>
                  <td className={`py-2.5 pr-6 ${severityTextClass[a.severity] || 'text-gray-300'}`}>{a.severity}</td>
                  <td className="py-2.5 pr-6 text-gray-400 text-xs">{new Date(a.timestamp).toLocaleString()}</td>
                  <td className="py-2.5 text-gray-500 text-xs">{a.metadata?.closureNote ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-gray-500 py-4 text-center">
          no auto-closed alerts in the last {timeFilter}
        </p>
      )}
    </section>
  );
}

// ─── DrillDownModal ────────────────────────────────────────────────────────────

// full alert detail overlay — state timeline, metadata dump, and resolve action
function DrillDownModal({ selectedAlert, onClose, onResolve, resolving }) {
  if (!selectedAlert) return null;
  const { alert, history } = selectedAlert;

  return (
    <div
      className="fixed inset-0 bg-black/75 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()} // clicking the backdrop closes the modal
    >
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh] flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">{alert.sourceType}</p>
            <h2 className="text-base font-semibold text-white font-mono">{alert.alertid}</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xs transition-colors shrink-0">
            close
          </button>
        </div>

        <span className={statusBadgeClass(alert.status)}>{alert.status}</span>

        <div className="bg-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">metadata</p>
          <pre className="text-xs text-gray-300 whitespace-pre-wrap break-all leading-relaxed">
            {JSON.stringify(alert.metadata ?? {}, null, 2)}
          </pre>
        </div>

        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">state history</p>
          <ol className="relative border-l border-gray-700 ml-2 flex flex-col gap-4">
            {history.map((h, i) => (
              <li key={i} className="ml-5">
                <span className="absolute -left-1.5 mt-0.5 w-3 h-3 rounded-full bg-indigo-600 border-2 border-gray-900" />
                <span className={statusBadgeClass(h.status)}>{h.status}</span>
                <p className="text-xs text-gray-500 mt-1">{new Date(h.at).toLocaleString()}</p>
              </li>
            ))}
          </ol>
        </div>

        {alert.status !== 'RESOLVED' ? (
          <button
            onClick={onResolve}
            disabled={resolving}
            className="w-full bg-green-700 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm py-2.5 rounded-xl transition-colors font-medium"
          >
            {resolving ? 'resolving...' : 'mark as resolved'}
          </button>
        ) : (
          <p className="text-center text-sm text-green-400">
            resolved by {alert.metadata?.resolvedBy ?? 'unknown'}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Dashboard (main) ──────────────────────────────────────────────────────────

// empty state to reset to on logout or before first fetch
const EMPTY_DATA = {
  summary: { bySeverity: [], topDrivers: [] },
  trends: [],
  recentAlerts: [],
  autoClosedAlerts: [],
  rulesConfig: null,
};

export default function Dashboard() {
  // token lives in localStorage so a page refresh doesn't log the user out
  const [token, setToken] = useState(() => localStorage.getItem('token'));

  const [loginForm, setLoginForm]     = useState({ email: '', password: '' });
  const [loginError, setLoginError]   = useState('');

  // all fetched data in one object — one setter instead of five
  const [data, setData] = useState(EMPTY_DATA);

  const [timeFilter, setTimeFilter]       = useState('24h');
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [loading, setLoading]             = useState(false);
  const [resolving, setResolving]         = useState(false);

  const getFilterDate = useCallback(() => {
    const now = new Date();
    const hoursMap = { '24h': 24, '48h': 48, '7d': 168 };
    now.setHours(now.getHours() - (hoursMap[timeFilter] ?? 24));
    return now.toISOString();
  }, [timeFilter]);

  const fetchDashboard = useCallback(async (tok) => {
    setLoading(true);
    try {
      // all requests fire in parallel — no serial waterfall
      const [summary, trends, recentAlerts, autoClosedAlerts, rulesConfig] = await Promise.all([
        api('/api/alerts/summary', {}, tok),
        api('/api/alerts/trends', {}, tok),
        api('/api/alerts?limit=20', {}, tok),
        api(`/api/alerts?status=AUTO-CLOSED&since=${getFilterDate()}&limit=20`, {}, tok),
        api('/api/rules/config', {}, tok),
      ]);
      setData({ summary, trends, recentAlerts, autoClosedAlerts, rulesConfig });
    } catch (err) {
      console.error('dashboard fetch failed:', err);
      // stale or invalid token — kick back to login
      if (err.message === 'token expired, please log in again' || err.message === 'invalid token') {
        localStorage.removeItem('token');
        setToken(null);
      }
    } finally {
      setLoading(false);
    }
  }, [getFilterDate]);

  // re-fetch whenever the token arrives or the time filter changes
  useEffect(() => {
    if (!token) return;
    fetchDashboard(token);
  }, [token, timeFilter, fetchDashboard]);

  const login = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const { token: t } = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(loginForm) });
      localStorage.setItem('token', t);
      setToken(t);
    } catch (err) {
      setLoginError(err.message);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setData(EMPTY_DATA); // wipe state so re-login starts fresh
  };

  const openDrillDown = async (alert) => {
    try {
      const detail = await api(`/api/alerts/${alert._id}/history`, {}, token);
      setSelectedAlert(detail);
    } catch (err) {
      console.error('failed to load alert details:', err);
    }
  };

  const resolveAlert = async () => {
    if (!selectedAlert) return;
    setResolving(true);
    try {
      const { alert: updated } = await api(
        `/api/alerts/${selectedAlert.alert._id}/resolve`,
        { method: 'PATCH' },
        token
      );
      setSelectedAlert((prev) => ({ ...prev, alert: updated })); // update modal in place without closing
      fetchDashboard(token);
    } catch (err) {
      console.error('resolve failed:', err);
    } finally {
      setResolving(false);
    }
  };

  if (!token) {
    return <LoginScreen form={loginForm} setForm={setLoginForm} error={loginError} onSubmit={login} />;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between sticky top-0 bg-gray-950 z-10">
        <h1 className="text-base font-semibold tracking-tight">moveinsync — alert dashboard</h1>
        <div className="flex items-center gap-4">
          {loading && <span className="text-xs text-gray-500 animate-pulse">refreshing...</span>}
          <button onClick={() => fetchDashboard(token)} className="text-xs text-gray-400 hover:text-white transition-colors">refresh</button>
          <button onClick={logout}                      className="text-xs text-gray-400 hover:text-white transition-colors">sign out</button>
        </div>
      </header>

      <main className="px-6 py-6 flex flex-col gap-8 max-w-7xl mx-auto">
        <StatCards bySeverity={data.summary.bySeverity} />

        <TrendsChart trends={data.trends} topDrivers={data.summary.topDrivers} />

        <RecentAlertsTable alerts={data.recentAlerts} onRowClick={openDrillDown} />

        <AlertsTable
          alerts={data.autoClosedAlerts}
          onRowClick={openDrillDown}
          timeFilter={timeFilter}
          onTimeFilterChange={setTimeFilter}
        />

        {/* rules config — small enough to keep inline */}
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-xs text-gray-500 mb-4 uppercase tracking-widest">active rule config</h2>
          {data.rulesConfig ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(data.rulesConfig).map(([type, rule]) => (
                <div key={type} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
                  <p className="text-indigo-400 font-mono text-sm mb-3">{type}</p>
                  <dl className="flex flex-col gap-1.5">
                    {Object.entries(rule).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 text-xs">
                        <dt className="text-gray-500">{k}</dt>
                        <dd className="text-gray-200 font-medium">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">loading...</p>
          )}
        </section>
      </main>

      <DrillDownModal
        selectedAlert={selectedAlert}
        onClose={() => setSelectedAlert(null)}
        onResolve={resolveAlert}
        resolving={resolving}
      />
    </div>
  );
}
