import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { API_VERSION } from "@kaipos/shared";
import { getClient } from "./db/client.js";

const app = new Hono();

app.use("/*", cors());

app.get("/api/health", async (c) => {
  let dbStatus = "disconnected";

  try {
    const client = await getClient();
    await client.db().command({ ping: 1 });
    dbStatus = "connected";
  } catch {
    dbStatus = "error";
  }

  return c.json({
    success: true,
    data: {
      service: "kaipos-api",
      version: API_VERSION,
      database: dbStatus,
      timestamp: new Date().toISOString(),
    },
  });
});

const port = Number(process.env.PORT) || 4000;

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => {
  console.log(`KaiPOS Backend running on http://localhost:${port}`);
});

export default app;
