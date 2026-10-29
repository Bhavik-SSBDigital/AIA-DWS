import jwt from "jsonwebtoken";

import prisma from "../config/prisma-config.js";

// Reads the Bearer token from either "authorization" or "x-authorization".
// The frontend upload / file-data / WOPI calls send "x-authorization",
// while most other calls send "authorization". Both must be accepted,
// otherwise requireAuth rejects valid requests with 401.
export const extractBearerToken = (req) => {
  const header = req.headers["authorization"] || req.headers["x-authorization"];
  if (!header || typeof header !== "string" || !header.startsWith("Bearer ")) {
    return null;
  }
  const token = header.slice(7).trim();
  return token || null;
};

// Verify User Function
export const verifyUser = async (accessToken) => {
  try {
    if (!accessToken) return "Unauthorized";

    const decodedData = jwt.verify(accessToken, process.env.SECRET_ACCESS_KEY);

    // Fetch full user details from the database
    const user = decodedData.id
      ? await prisma.user.findUnique({
          where: { id: parseInt(decodedData.id) },
        })
      : await prisma.user.findUnique({
          where: { id: parseInt(decodedData.userId) },
        });

    if (!user) {
      throw new Error("User not found");
    }

    // ✅ VAPT FIX #12: Improper Session Termination
    // Check if the token was issued BEFORE the password was changed (forced session invalidation)
    if (user.passwordChangedAt && decodedData.iat) {
      const tokenIssuedAt = decodedData.iat * 1000; // Convert to milliseconds
      const passwordChangedTime = user.passwordChangedAt.getTime();

      if (tokenIssuedAt < passwordChangedTime) {
        console.warn(
          "Token invalidated: Issued before recent password change.",
        );
        return "Unauthorized";
      }
    }

    // Prevent deactivated users from accessing the system
    if (user.status === "Inactive") {
      return "Unauthorized";
    }

    const dbUser = await prisma.user.findUnique({
      where: { username: user.username },
      include: { tokens: true, roles: true },
    });

    let roles = await prisma.role.findMany({
      where: { id: { in: dbUser.roles.map((role) => role.roleId) } },
    });

    const isAdmin = roles.some((role) => role.isAdmin) || user.isAdmin;
    const isRootLevel =
      roles.some((role) => role.isRootLevel) || user.isRootLevel;

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      isAdmin: isAdmin,
      isRootLevel: isRootLevel,
      ...decodedData, // Include additional token properties, if needed
    };
  } catch (error) {
    console.log("Error verifying user:", error);
    return "Unauthorized";
  }
};

// ✅ VAPT FIX #2: Middleware for Unauthorized API Endpoints Access
// Accepts both "authorization" and "x-authorization" headers.
export const requireAuth = async (req, res, next) => {
  try {
    const token = extractBearerToken(req);

    if (!token) {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    const userData = await verifyUser(token);
    if (userData === "Unauthorized") {
      return res.status(401).json({ message: "Unauthorized request" });
    }

    req.user = userData;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Unauthorized request" });
  }
};

// ✅ VAPT FIX #5: Middleware for Unauthorized access of File Logs
export const requireAdmin = async (req, res, next) => {
  try {
    const token = extractBearerToken(req);
    const userData = await verifyUser(token);

    if (
      userData === "Unauthorized" ||
      (!userData.isAdmin && !userData.isRootLevel)
    ) {
      return res
        .status(403)
        .json({ message: "Forbidden: Admin access required" });
    }

    req.user = userData;
    next();
  } catch (error) {
    return res
      .status(403)
      .json({ message: "Forbidden: Admin access required" });
  }
};

export const requireStrictAdmin = async (req, res, next) => {
  try {
    const token = extractBearerToken(req);
    const userData = await verifyUser(token);

    if (userData === "Unauthorized" || !userData.isAdmin) {
      return res
        .status(403)
        .json({ message: "Forbidden: Admin access required" });
    }

    req.user = userData;
    next();
  } catch (error) {
    return res
      .status(403)
      .json({ message: "Forbidden: Admin access required" });
  }
};
