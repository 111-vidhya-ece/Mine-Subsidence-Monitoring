// ============================================================
// SENSOR CONFIGURATION — change thresholds here only
// ============================================================

export type Status = "NORMAL" | "WARNING" | "CRITICAL";

export type SensorKey = "tilt" | "vibration" | "stretch";

export interface SensorReading {
  tilt: number;
  vibration: number;
  stretch: number;
}

export interface SensorMeta {
  key: SensorKey;
  label: string;
  unit: string;
  max: number; // used for the progress indicator
  warning: number; // > warning => WARNING
  critical: number; // > critical => CRITICAL
  step: number;
}

export const SENSORS: SensorMeta[] = [
  { key: "tilt", label: "Tilt", unit: "°", max: 40, warning: 10, critical: 20, step: 0.1 },
  { key: "vibration", label: "Vibration", unit: " g", max: 1.2, warning: 0.3, critical: 0.6, step: 0.01 },
  { key: "stretch", label: "Stretch", unit: "%", max: 100, warning: 50, critical: 75, step: 1 },
];

// Minimum time between repeated alerts for the same sensor at the same level.
export const ALERT_COOLDOWN_MS = 5 * 60 * 1000;

// Where alerts are delivered.
export const ALERT_RECIPIENTS = {
  phone: "9841528046",
  email: "karthikeyanram52@gmail.com",
};

export function statusFor(key: SensorKey, value: number): Status {
  const meta = SENSORS.find((s) => s.key === key)!;
  if (value > meta.critical) return "CRITICAL";
  if (value > meta.warning) return "WARNING";
  return "NORMAL";
}

export function overallStatus(reading: SensorReading): Status {
  const all = SENSORS.map((s) => statusFor(s.key, reading[s.key]));
  if (all.includes("CRITICAL")) return "CRITICAL";
  if (all.includes("WARNING")) return "WARNING";
  return "NORMAL";
}

export function formatValue(key: SensorKey, value: number): string {
  const meta = SENSORS.find((s) => s.key === key)!;
  const digits = key === "vibration" ? 2 : key === "tilt" ? 1 : 0;
  return `${value.toFixed(digits)}${meta.unit}`;
}

export function alertMessage(reading: SensorReading, status: Status): string {
  const parts = SENSORS.map((s) => `${s.label}: ${formatValue(s.key, reading[s.key])}`).join(", ");
  if (status === "CRITICAL") {
    return `CRITICAL ALERT: Sensor monitoring system detected a critical condition. ${parts}. Immediate attention required.`;
  }
  return `WARNING: Sensor monitoring system detected an abnormal condition. ${parts}. Please check the system.`;
}
