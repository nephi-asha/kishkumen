// auth.js
const jwt = require("jsonwebtoken");
const db = require("../database/db");

// Middleware to verify JWT token and attach user info to req
const verifyToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader) {
    return res
      .status(401)
      .json({ message: "Authorization token not provided." });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Authorization token not found." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    if (!req.user.roles.includes("Super Admin") && !req.user.schemaName) {
      return res
        .status(403)
        .json({
          message: "Access denied: User not associated with a tenant schema.",
        });
    }
    next();
  } catch (error) {
    console.error("Token verification failed:", error.message);
    return res.status(403).json({ message: "Invalid or expired token." });
  }
};

// Middleware to set the PostgreSQL search_path for the current session
const setTenantSchema = async (req, res, next) => {
  if (
    req.user &&
    req.user.schemaName &&
    !req.user.roles.includes("Super Admin")
  ) {
    try {
      await db.query(`SET search_path TO ${req.user.schemaName}, public`);
      next();
    } catch (error) {
      console.error(
        `Error setting search_path for schema ${req.user.schemaName}:`,
        error
      );
      return res
        .status(500)
        .json({ message: "Server error setting tenant context." });
    }
  } else {
    try {
      await db.query(`SET search_path TO public`);
      next();
    } catch (error) {
      console.error("Error resetting search_path to public:", error);
      return res
        .status(500)
        .json({ message: "Server error resetting tenant context." });
    }
  }
};

// Middleware to check if user has any of the required roles
// Middleware to check if user has any of the required roles
const authorizeRoles = (requiredRoles) => {
  return (req, res, next) => {
    // 1. Check if the user is a Super Admin and grant immediate access.
    if (req.user && req.user.roles && req.user.roles.includes('Super Admin')) {
      return next();
    }
    
    // 2. Proceed with the standard role check for other users.
    if (!req.user || !req.user.roles || req.user.roles.length === 0) {
      return res.status(403).json({ message: "Access denied: User has no assigned roles." });
    }

    const hasRequiredRole = req.user.roles.some((role) =>
      requiredRoles.includes(role)
    );

    if (!hasRequiredRole) {
      return res.status(403).json({ message: "Access denied: Insufficient privileges." });
    }
    next();
  };
};

module.exports = {
  verifyToken,
  setTenantSchema,
  authorizeRoles,
};