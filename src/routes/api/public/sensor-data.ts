import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Latest reading pushed by the ESP32. Kept in memory for now; swap for a
// database write when persistence is needed.
let latest: { tilt: number; vibration: number; stretch: number; receivedAt: string } | null = null;

const schema = z.object({
  tilt: z.number(),
  vibration: z.number(),
  stretch: z.number(),
});

export const Route = createFileRoute("/api/public/sensor-data")({
  server: {
    handlers: {
      GET: async () =>
        new Response(JSON.stringify(latest ?? { connected: false }), {
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        }),
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = schema.parse(await request.json());
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "Invalid payload" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        latest = { ...parsed, receivedAt: new Date().toISOString() };
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
