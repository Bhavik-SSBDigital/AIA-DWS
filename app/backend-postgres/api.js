import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import router from "./routes/routes.js";
import db from "./db.js";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import dotenv from "dotenv";
import { startPaymentScheduler } from "./services/paymentScheduler.js";
import { closeBrowser } from "./controller/description-controller.js";

// ==========================================
// 🚨 GLOBAL CRASH CATCHERS
// ==========================================
process.on("uncaughtException", (err) => {
  console.error("\n[FATAL CRASH] Uncaught Exception:", err);
  setImmediate(() => process.exit(1));
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    "\n[FATAL CRASH] Unhandled Rejection at:",
    promise,
    "reason:",
    reason,
  );
  setImmediate(() => process.exit(1));
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const PORT = process.env.PORT;

const app = express();

// ✅ VAPT FIX #22: Server Version Disclosure
app.disable("x-powered-by");

// ✅ VAPT FIX #21 & #13: Applies critical security headers
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
    frameguard: false,
  }),
);

// ==========================================
// 🌐 STRICT CORS CONFIGURATION
// ==========================================
const corsOptions = {
  origin: ["http://localhost:3000", "https://ai-audit.aia.local"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "HEAD"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-authorization",
    "X-WOPI-Override",
    "X-WOPI-Lock",
    "Origin",
    "Accept",
    "X-Requested-With",
    "x-file-name",
    "x-current-chunk",
    "x-total-chunks",
    "x-chunk-size",
    "x-involved-in-process",
    "x-tags",
    "x-department-name",
    "x-file-id",
    "x-file-path",
  ],
};

app.use(cors(corsOptions));

// ✅ INCREASED PAYLOAD LIMIT
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.get("/healthz", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "dws-backend",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// 🕵️ ADVANCED REQUEST LOGGER
// ==========================================
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const requestId = Math.random().toString(36).substring(7);
  req.requestId = requestId;
  req.startedAt = Date.now();

  console.log(
    `[${timestamp}] [REQ: ${requestId}] INCOMING: ${req.method} ${req.originalUrl}`,
  );

  res.on("finish", () => {
    console.log(
      `[${new Date().toISOString()}] [REQ: ${requestId}] COMPLETED: Status ${res.statusCode} Duration ${Date.now() - req.startedAt}ms`,
    );
  });

  res.on("close", () => {
    if (!res.writableEnded) {
      console.error(
        `[${new Date().toISOString()}] [REQ: ${requestId}] TERMINATED: Connection closed by client before finishing!`,
      );
    }
  });

  next();
});

app.use(express.static(path.join(__dirname, "build")));

// MAIN ROUTER
app.use("/", router);

// Add support for OPTIONS requests
app.options("/wopi/files/:id", (req, res) => {
  res
    .set({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
      "Access-Control-Allow-Headers":
        "Authorization, X-WOPI-Override, X-WOPI-Lock",
    })
    .send();
});

// Serve React app
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "build", "index.html"));
});

app.use((req, res, next) => {
  res.status(404).json({ message: "Resource not found" });
});

// Catch 500s
app.use((err, req, res, next) => {
  console.error("[EXPRESS ROUTE ERROR]", err);
  res.status(500).json({ message: "Internal server error" });
});

// ==========================================
// 🚀 SERVER STARTUP & GRACEFUL SHUTDOWN
// ==========================================
const server = app.listen(PORT, () => {
  startPaymentScheduler();
  console.log("listening on", `${PORT}`);
});

const gracefulShutdown = async (signal) => {
  console.log(
    `\n[Shutdown] ${signal} received. Initiating graceful shutdown...`,
  );

  server.close(async () => {
    console.log("[Shutdown] HTTP server closed. Cleaning up Puppeteer...");
    try {
      await closeBrowser();
      console.log("[Shutdown] Cleanup complete. Exiting cleanly.");
      process.exit(0);
    } catch (err) {
      console.error("[Shutdown] Error during cleanup:", err);
      process.exit(1);
    }
  });

  setTimeout(() => {
    console.error(
      "[Shutdown] Graceful shutdown timed out after 10s. Forcing exit.",
    );
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
