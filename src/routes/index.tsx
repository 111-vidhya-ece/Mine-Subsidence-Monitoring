import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";
import { Activity, AlertTriangle, CheckCircle2, Radio, ShieldAlert } from "lucide-react";
import {
  ALERT_COOLDOWN_MS,
  ALERT_RECIPIENTS,
  SENSORS,
  alertMessage,
  formatValue,
  overallStatus,
  statusFor,
  type SensorKey,
  type SensorReading,
  type Status,
} from "@/lib/sensor-config";
import { sendAlertNotification, type DeliveryResult } from "@/lib/notifications.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Smart Sensor Monitoring System" },
      {
        name: "description",
        content:
          "Real-time tilt, vibration and stretch monitoring dashboard with SMS and email alerts.",
      },
      { property: "og:title", content: "Smart Sensor Monitoring System" },
      {
        property: "og:description",
        content: "Real-time tilt, vibration and stretch monitoring with automatic alerts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const statusStyles: Record<Status, { bg: string; text: string; bar: string; ring: string }> = {
  NORMAL: {
    bg: "bg-normal/12",
    text: "text-normal",
    bar: "bg-normal",
    ring: "ring-normal/30",
  },
  WARNING: {
    bg: "bg-warning/15",
    text: "text-warning",
    bar: "bg-warning",
    ring: "ring-warning/35",
  },
  CRITICAL: {
    bg: "bg-critical/12",
    text: "text-critical",
    bar: "bg-critical",
    ring: "ring-critical/35",
  },
};

interface AlertRow {
  id: string;
  time: string;
  sensor: string;
  value: string;
  status: Status;
  sms: DeliveryResult["sms"];
  email: DeliveryResult["email"];
}

interface Point {
  t: string;
  tilt: number;
  vibration: number;
  stretch: number;
}

const initialReading: SensorReading = { tilt: 4.2, vibration: 0.18, stretch: 32 };

function timeLabel(d: Date) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function Dashboard() {
  const [reading, setReading] = useState<SensorReading>(initialReading);
  const [manual, setManual] = useState(false);
  const [history, setHistory] = useState<Point[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string>("");
  const [mounted, setMounted] = useState(false);

  const lastStatus = useRef<Record<SensorKey, Status>>({
    tilt: "NORMAL",
    vibration: "NORMAL",
    stretch: "NORMAL",
  });
  const lastSent = useRef<Record<string, number>>({});

  useEffect(() => setMounted(true), []);

  // --- Demo data generator (replace with ESP32 feed from /api/public/sensor-data) ---
  useEffect(() => {
    if (manual) return;
    const tick = () => {
      setReading((prev) => ({
        tilt: clamp(prev.tilt + rand(1.6), 0, 35),
        vibration: clamp(prev.vibration + rand(0.06), 0, 1.1),
        stretch: clamp(prev.stretch + rand(4), 0, 100),
      }));
    };
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [manual]);

  // --- Record graph points + timestamp ---
  useEffect(() => {
    const now = new Date();
    setUpdatedAt(timeLabel(now));
    setHistory((h) => [...h.slice(-29), { t: timeLabel(now), ...round(reading) }]);
  }, [reading]);

  const raiseAlert = useCallback(
    async (sensor: SensorKey, value: number, status: Status, snapshot: SensorReading) => {
      const meta = SENSORS.find((s) => s.key === sensor)!;
      const now = new Date();
      const row: AlertRow = {
        id: `${sensor}-${now.getTime()}`,
        time: timeLabel(now),
        sensor: meta.label,
        value: formatValue(sensor, value),
        status,
        sms: "not_configured",
        email: "not_configured",
      };
      setAlerts((a) => [row, ...a].slice(0, 25));
      try {
        const res = await sendAlertNotification({
          data: {
            status: status as "WARNING" | "CRITICAL",
            sensor: meta.label,
            value: formatValue(sensor, value),
            message: alertMessage(snapshot, status),
            phone: ALERT_RECIPIENTS.phone,
            email: ALERT_RECIPIENTS.email,
            time: now.toLocaleString(),
            reading: round(snapshot),
          },
        });
        setAlerts((a) => a.map((r) => (r.id === row.id ? { ...r, ...res } : r)));
      } catch {
        setAlerts((a) =>
          a.map((r) => (r.id === row.id ? { ...r, sms: "failed", email: "failed" } : r)),
        );
      }
    },
    [],
  );

  // --- Escalation-only alerting with cooldown ---
  useEffect(() => {
    const rank: Record<Status, number> = { NORMAL: 0, WARNING: 1, CRITICAL: 2 };
    for (const meta of SENSORS) {
      const value = reading[meta.key];
      const status = statusFor(meta.key, value);
      const prev = lastStatus.current[meta.key];
      const key = `${meta.key}:${status}`;
      const cooled = Date.now() - (lastSent.current[key] ?? 0) > ALERT_COOLDOWN_MS;
      const escalated = rank[status] > rank[prev];
      if (status !== "NORMAL" && (escalated || cooled)) {
        lastSent.current[key] = Date.now();
        void raiseAlert(meta.key, value, status, reading);
      }
      lastStatus.current[meta.key] = status;
    }
  }, [reading, raiseAlert]);

  const overall = useMemo(() => overallStatus(reading), [reading]);
  const os = statusStyles[overall];

  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Smart Sensor Monitoring System
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Real-Time Tilt, Vibration &amp; Stretch Monitoring
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full bg-normal/12 px-3 py-1.5 font-medium text-normal">
              <span className="live-dot h-2 w-2 rounded-full bg-normal" />
              Sensor Connected · Demo Mode
            </span>
            <span className="text-muted-foreground">
              Last Updated: {mounted ? updatedAt : "—"}
            </span>
          </div>
        </header>

        {/* Overall status */}
        <section
          className={`rounded-2xl border border-border p-6 ring-1 ${os.bg} ${os.ring} sm:p-8`}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-muted-foreground">
                SYSTEM STATUS
              </p>
              <p className={`mt-1 text-4xl font-bold ${os.text}`}>{overall}</p>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                {overall === "NORMAL"
                  ? "All sensor values are within the safe range."
                  : alertMessage(reading, overall)}
              </p>
            </div>
            <div className={`${os.text}`}>
              {overall === "NORMAL" ? (
                <CheckCircle2 className="h-14 w-14" />
              ) : overall === "WARNING" ? (
                <AlertTriangle className="h-14 w-14" />
              ) : (
                <ShieldAlert className="h-14 w-14" />
              )}
            </div>
          </div>
        </section>

        {/* Sensor cards */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SENSORS.map((meta) => {
            const value = reading[meta.key];
            const status = statusFor(meta.key, value);
            const s = statusStyles[status];
            const pct = Math.min(100, (value / meta.max) * 100);
            return (
              <article
                key={meta.key}
                className="rounded-xl border border-border bg-surface p-5 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">{meta.label}</h2>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${s.bg} ${s.text}`}
                  >
                    {status}
                  </span>
                </div>
                <p className="mt-3 text-3xl font-bold tabular-nums text-foreground">
                  {formatValue(meta.key, value)}
                </p>
                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${s.bar}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Warning &gt; {meta.warning}
                  {meta.unit} · Critical &gt; {meta.critical}
                  {meta.unit}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Last updated: {mounted ? updatedAt : "—"}
                </p>
              </article>
            );
          })}
        </section>

        {/* Live graph */}
        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Activity className="h-4 w-4" /> Live Sensor Graph
          </h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="t" tick={{ fontSize: 11 }} minTickGap={24} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="tilt"
                  name="Tilt (°)"
                  stroke="var(--color-primary)"
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="vibration"
                  name="Vibration (g)"
                  stroke="var(--color-warning)"
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="stretch"
                  name="Stretch (%)"
                  stroke="var(--color-normal)"
                  dot={false}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Demo controls */}
        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Radio className="h-4 w-4" /> Demo Controls
            </h2>
            <button
              onClick={() => setManual((m) => !m)}
              className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
            >
              {manual ? "Resume simulated feed" : "Pause & set values manually"}
            </button>
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-3">
            {SENSORS.map((meta) => (
              <label key={meta.key} className="block text-sm">
                <span className="flex items-center justify-between text-foreground">
                  {meta.label}
                  <span className="tabular-nums text-muted-foreground">
                    {formatValue(meta.key, reading[meta.key])}
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={meta.max}
                  step={meta.step}
                  value={reading[meta.key]}
                  onChange={(e) => {
                    setManual(true);
                    setReading((r) => ({ ...r, [meta.key]: Number(e.target.value) }));
                  }}
                  className="mt-2 w-full accent-[var(--color-primary)]"
                />
              </label>
            ))}
          </div>
        </section>

        {/* Alert history */}
        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-foreground">Alert History</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Time</th>
                  <th className="pb-2 font-medium">Sensor</th>
                  <th className="pb-2 font-medium">Value</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Notification</th>
                </tr>
              </thead>
              <tbody>
                {alerts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      No alerts yet — all readings within safe range.
                    </td>
                  </tr>
                )}
                {alerts.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="py-2.5 tabular-nums">{a.time}</td>
                    <td className="py-2.5">{a.sensor}</td>
                    <td className="py-2.5 tabular-nums">{a.value}</td>
                    <td className={`py-2.5 font-semibold ${statusStyles[a.status].text}`}>
                      {a.status}
                    </td>
                    <td className="py-2.5 text-xs">
                      <Delivery label="SMS" state={a.sms} />{" "}
                      <Delivery label="Email" state={a.email} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="pb-4 text-center text-xs text-muted-foreground">
          ESP32 ready — POST {"{"}&quot;tilt&quot;,&quot;vibration&quot;,&quot;stretch&quot;{"}"} to
          /api/public/sensor-data
        </footer>
      </div>
    </main>
  );
}

function Delivery({ label, state }: { label: string; state: DeliveryResult["sms"] }) {
  const map = {
    sent: { mark: "✓", cls: "text-normal" },
    failed: { mark: "✕", cls: "text-critical" },
    not_configured: { mark: "· pending setup", cls: "text-muted-foreground" },
  } as const;
  const v = map[state];
  return (
    <span className={`mr-2 inline-flex items-center gap-1 ${v.cls}`}>
      {label} {v.mark}
    </span>
  );
}

function rand(scale: number) {
  return (Math.random() - 0.45) * scale;
}
function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}
function round(r: SensorReading) {
  return {
    tilt: Number(r.tilt.toFixed(1)),
    vibration: Number(r.vibration.toFixed(2)),
    stretch: Number(r.stretch.toFixed(0)),
  };
}
