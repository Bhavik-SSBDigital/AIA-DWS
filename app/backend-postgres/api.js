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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const PORT = process.env.PORT;

const app = express();

// ✅ VAPT FIX #22: Server Version Disclosure
app.disable("x-powered-by");

// ✅ VAPT FIX #21 & #13: Applies critical security headers (X-Frame-Options, X-Content-Type-Options, HSTS)
app.use(
  helmet({
    contentSecurityPolicy: false, // Disabled to prevent blocking existing React inline scripts
    crossOriginEmbedderPolicy: false,
  }),
);

// Middleware to log incoming request URLs
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
app.use(cors());
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

app.listen(PORT, () => {
  console.log("listening on", `${PORT}`);
});
