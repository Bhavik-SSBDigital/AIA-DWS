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
    contentSecurityPolicy: false, // Disabled to prevent blocking existing React inline scripts
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }, // <-- CRITICAL FIX: Allows the cross-origin file read
    crossOriginOpenerPolicy: false, // <-- ADD THIS: Stops Chrome from blocking new tabs
    frameguard: false,
  }),
);

// ==========================================
// 🌐 STRICT CORS CONFIGURATION (CRITICAL FIX FOR blocked:origin)
// ==========================================
// ==========================================
// 🌐 STRICT CORS CONFIGURATION (CRITICAL FIX FOR blocked:origin)
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
    // Add all the custom headers expected by file_upload controller below:
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

// Middleware to log incoming request URLs (Uncomment for debugging)
// app.use((req, res, next) => {
//   console.log(`Request received at: ${req.method} ${req.url}`);
//   next();
// });

// Apply express.raw specifically for WOPI POST and PUT requests
// app.use(
//   "/wopi/files/:id/contents",
//   express.raw({ type: "*/*", limit: "50mb" }) // Use */* to handle any Content-Type
// );

// Other Middleware
app.use(express.json()); // For JSON-based APIs
app.use(express.static(path.join(__dirname, "build")));
app.use("/", router);

// Add support for OPTIONS requests (include PUT for WOPI)
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

// Catch 500s (Internal Server Errors) so Express doesn't leak stack traces or its name
app.use((err, req, res, next) => {
  console.error("System error encountered", err); // Safely logged internally
  res.status(500).json({ message: "Internal server error" });
});

app.listen(PORT, () => {
  startPaymentScheduler();
  console.log("listening on", `${PORT}`);
});
