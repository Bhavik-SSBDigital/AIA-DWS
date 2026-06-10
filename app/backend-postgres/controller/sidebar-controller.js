import { verifyUser } from "../utility/verifyUser.js";

// Note: If you have a centralized prisma client instance (e.g., in utility/prisma.js),
// import that instead of instantiating a new one here.
import prisma from "../config/prisma-config.js";

const DEFAULT_CONFIG = {
  normalUser: [
    "dashboard",
    "files",
    "search",
    "workflows",
    "masterTags",
    "processWork",
    "processInitiated",
    "processInitiate",
    "recommendations",
  ],
  adminUser: [
    "dashboard",
    "files",
    "search",
    "workflows",
    "masterTags",
    "processWork",
    "processInitiated",
    "processInitiate",
    "recommendations",
    "logs",
    "departments",
    "roles",
    "users",
    "reports",
  ],
  rootLevelUser: [
    "dashboard",
    "files",
    "search",
    "workflows",
    "masterTags",
    "processWork",
    "processInitiated",
    "processInitiate",
    "recommendations",
    "logs",
    "departments",
    "roles",
    "users",
    "reports",
  ],
};

export const get_sidebar_config = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // GET config from Database
    const record = await prisma.appConfig.findUnique({
      where: { key: "sidebarConfig" },
    });

    return res.status(200).json({
      success: true,
      config: record?.value || DEFAULT_CONFIG,
    });
  } catch (error) {
    console.error("get_sidebar_config error:", error);
    return res.status(500).json({ message: "Failed to get sidebar config" });
  }
};

export const save_sidebar_config = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    const userData = await verifyUser(accessToken);

    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!userData.isAdmin && !userData.isRootLevel) {
      return res
        .status(403)
        .json({ message: "Forbidden: Admin privileges required" });
    }

    const { config } = req.body;

    if (!config || typeof config !== "object") {
      return res.status(400).json({ message: "Invalid config payload" });
    }

    // SAVE config to Database via Upsert
    await prisma.appConfig.upsert({
      where: { key: "sidebarConfig" },
      update: { value: config, updatedBy: userData.id },
      create: { key: "sidebarConfig", value: config, updatedBy: userData.id },
    });

    return res
      .status(200)
      .json({ success: true, message: "Sidebar config saved" });
  } catch (error) {
    console.error("save_sidebar_config error:", error);
    return res.status(500).json({ message: "Failed to save sidebar config" });
  }
};
