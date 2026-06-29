import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet"; // ✅ VAPT FIX #21: Missing HTTP Headers
import router from "./routes/routes.js";
import db from "./db.js";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import dotenv from "dotenv";
import { startPaymentScheduler } from "./services/paymentScheduler.js";

// ==========================================
// 🚨 GLOBAL CRASH CATCHERS (CRITICAL FOR DEBUGGING SILENT DEATHS)
// ==========================================
process.on("uncaughtException", (err) => {
  console.error("\n[FATAL CRASH] Uncaught Exception:", err);
  // Optional: process.exit(1) if you want systemd to immediately restart it
});

process.on("unhandledRejection", (reason, promise) => {
  console.error(
    "\n[FATAL CRASH] Unhandled Rejection at:",
    promise,
    "reason:",
    reason,
  );
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

// ==========================================
// 🕵️ ADVANCED REQUEST LOGGER (PLACED BEFORE ROUTER)
// ==========================================
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const requestId = Math.random().toString(36).substring(7); // Unique ID per request

  // 1. Log the moment the request arrives
  console.log(
    `[${timestamp}] [REQ: ${requestId}] INCOMING: ${req.method} ${req.originalUrl}`,
  );

  // 2. Log the moment the response finishes (or fails)
  res.on("finish", () => {
    console.log(
      `[${new Date().toISOString()}] [REQ: ${requestId}] COMPLETED: Status ${res.statusCode}`,
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

app.listen(PORT, () => {
  startPaymentScheduler();
  console.log("listening on", `${PORT}`);
});
