import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      isAdmin: user.isAdmin,
      isRootLevel: user.isRootLevel,
      ...decodedData, // Include additional token properties, if needed
    };
  } catch (error) {
    console.log("Error verifying user:", error.message);
    return "Unauthorized";
  }
};

// ✅ VAPT FIX #2: Middleware for Unauthorized API Endpoints Access
export const requireAuth = async (req, res, next) => {
  const token =
    req.headers["authorization"]?.substring(7) ||
    req.headers["x-authorization"]?.substring(7);
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
