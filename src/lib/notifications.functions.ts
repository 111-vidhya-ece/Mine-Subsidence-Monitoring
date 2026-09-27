import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ============================================================
// NOTIFICATION LAYER
// Provider-agnostic. Plug in Twilio (or any SMS gateway) and an
// email provider by filling in the two send* helpers below.
// Credentials are only ever read on the server.
// ============================================================

const payloadSchema = z.object({
  status: z.enum(["WARNING", "CRITICAL"]),
  sensor: z.string(),
  value: z.string(),
  message: z.string(),
  phone: z.string(),
  email: z.string(),
  time: z.string(),
  reading: z.object({ tilt: z.number(), vibration: z.number(), stretch: z.number() }),
});

export type AlertPayload = z.infer<typeof payloadSchema>;

export interface DeliveryResult {
  sms: "sent" | "failed" | "not_configured";
  email: "sent" | "failed" | "not_configured";
  detail?: string;
}

export const sendAlertNotification = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => payloadSchema.parse(data))
  .handler(async ({ data }): Promise<DeliveryResult> => {
    const result: DeliveryResult = { sms: "not_configured", email: "not_configured" };

    // ---------------- SMS ----------------
    const sid = process.env["TWILIO_ACCOUNT_SID"];
    const token = process.env["TWILIO_AUTH_TOKEN"];
    const from = process.env["TWILIO_FROM_NUMBER"];
    if (sid && token && from) {
      try {
        const body = new URLSearchParams({ To: data.phone, From: from, Body: data.message });
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
        });
        result.sms = res.ok ? "sent" : "failed";
      } catch {
        result.sms = "failed";
      }
    }

    // ---------------- EMAIL ----------------
    // Rendered subject/body kept here so an email provider can be wired in
    // without touching the dashboard code.
    const subject = `[${data.status}] Sensor Monitoring Alert`;
    const text = [
      `${data.status} SENSOR ALERT`,
      "",
      `Time: ${data.time}`,
      "",
      `Tilt: ${data.reading.tilt}°`,
      `Vibration: ${data.reading.vibration} g`,
      `Stretch: ${data.reading.stretch}%`,
      "",
      `Status: ${data.status}`,
      `Threshold crossed by: ${data.sensor} (${data.value})`,
      "",
      data.message,
    ].join("\n");

    const emailKey = process.env["EMAIL_API_KEY"];
    const emailFrom = process.env["EMAIL_FROM"];
    if (emailKey && emailFrom) {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${emailKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: emailFrom, to: data.email, subject, text }),
        });
        result.email = res.ok ? "sent" : "failed";
      } catch {
        result.email = "failed";
      }
    }

    return result;
  });
