import express from "express";
import cors from "cors";
import helmet from "helmet";
import router from "./routes/routes.js";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT;

// ==========================================
// ✅ BASIC SECURITY
// ==========================================
app.disable("x-powered-by");

// ==========================================
// ✅ HELMET CONFIG (CRITICAL FOR COLLABORA)
// ==========================================
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false, // 🚨 MUST be disabled
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    frameguard: false,
  }),
);

// ==========================================
// ✅ FORCE REMOVE COEP (IMPORTANT)
// ==========================================
app.use((req, res, next) => {
  res.removeHeader("Cross-Origin-Embedder-Policy");
  res.removeHeader("Cross-Origin-Opener-Policy");
  next();
});

// ==========================================
// ✅ CORS CONFIG (INCLUDE COLLABORA + PROD)
// ==========================================
const corsOptions = {
  origin: [
    "http://localhost:3000",
    "https://ai-audit.aia.local",
    "https://collabora.aia-engineering.com",
    "https://dwsauditprd.aia-engineering.com",
  ],
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

// ==========================================
// ✅ WOPI-SPECIFIC FIX (CRITICAL)
// ==========================================
app.use("/wopi", (req, res, next) => {
  res.removeHeader("Cross-Origin-Embedder-Policy");
  res.removeHeader("Cross-Origin-Opener-Policy");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// ==========================================
// ✅ BODY PARSING
// ==========================================
app.use(express.json());

// ==========================================
// ✅ STATIC FILES
// ==========================================
app.use(express.static(path.join(__dirname, "build")));

// ==========================================
// ✅ ROUTES
// ==========================================
app.use("/", router);

// ==========================================
// ✅ WOPI OPTIONS HANDLER
// ==========================================
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

// ==========================================
// ✅ REACT FALLBACK
// ==========================================
app.get("*", (req, res) => {
  res.sendFile(path.resolve(__dirname, "build", "index.html"));
});

// ==========================================
// ✅ ERROR HANDLING
// ==========================================
app.use((req, res) => {
  res.status(404).json({ message: "Resource not found" });
});

app.use((err, req, res, next) => {
  console.error("System error encountered", err);
  res.status(500).json({ message: "Internal server error" });
});

// ==========================================
// ✅ START SERVER
// ==========================================
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
