import jwt from "jsonwebtoken";

import prisma from "../config/prisma-config.js";

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
// ✅ VAPT FIX #2: Middleware for Unauthorized API Endpoints Access
export const requireAuth = async (req, res, next) => {
  // Look for the token in headers FIRST, then fallback to the query string
  const token =
    req.headers["authorization"]?.substring(7) ||
    req.headers["x-authorization"]?.substring(7) ||
    req.query.token; // <-- THIS IS THE PIECE THAT WAS MISSING

  const userData = await verifyUser(token);

  if (userData === "Unauthorized") {
    return res.status(401).json({ message: "Unauthorized request" });
  }

  req.user = userData;
  next();
};

// ✅ VAPT FIX #5: Middleware for Unauthorized access of File Logs
export const requireAdmin = async (req, res, next) => {
  const token =
    req.headers["authorization"]?.substring(7) ||
    req.headers["x-authorization"]?.substring(7);
  const userData = await verifyUser(token);

  console.log("user data", userData);
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
};

export const requireStrictAdmin = async (req, res, next) => {
  const token =
    req.headers["authorization"]?.substring(7) ||
    req.headers["x-authorization"]?.substring(7);
  const userData = await verifyUser(token);

  if (userData === "Unauthorized" || !userData.isAdmin) {
    return res
      .status(403)
      .json({ message: "Forbidden: Admin access required" });
  }

  req.user = userData;
  next();
};
