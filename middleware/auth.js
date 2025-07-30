const jwt = require('jsonwebtoken');
const db = require('../database/db');

// Middleware to verify JWT token and attach user info to req
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ message: 'Authorization token not provided.' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Authorization token not found.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Attach decoded user info (userId, username, roles, tenantId, schemaName)

        // For Super Admin, we might not want to set a specific schema path
        // or we might want to allow them to specify it.
        // For now, if not Super Admin, ensure schemaName is present.
        if (!req.user.roles.includes('Super Admin') && !req.user.schemaName) {
             return res.status(403).json({ message: 'Access denied: User not associated with a tenant schema.' });
        }

        next();
    } catch (error) {
        console.error('Token verification failed:', error.message);
        return res.status(403).json({ message: 'Invalid or expired token.' });
    }
};

// Middleware to set the PostgreSQL search_path for the current session
// This must come AFTER verifyToken
const setTenantSchema = async (req, res, next) => {
    // Super Admin does not necessarily operate within a single tenant's schema by default
    // They might need to explicitly query a schema or operate on the public schema.
    // For regular users, we set the schema.
    if (req.user && req.user.schemaName && !req.user.roles.includes('Super Admin')) {
        try {
            // Set the search_path for the current client connection
            // This ensures all subsequent queries in this request context target the correct schema.
            await db.query(`SET search_path TO ${req.user.schemaName}, public`);
            next();
        } catch (error) {
            console.error(`Error setting search_path for schema ${req.user.schemaName}:`, error);
            return res.status(500).json({ message: 'Server error setting tenant context.' });
        }
    } else {
        // For Super Admin or users without a schema (e.g., during initial setup),
        // ensure default search_path to public.
        try {
            await db.query(`SET search_path TO public`);
            next();
        } catch (error) {
            console.error('Error resetting search_path to public:', error);
            return res.status(500).json({ message: 'Server error resetting tenant context.' });
        }
    }
};


// Middleware to check if user has any of the required roles
const authorizeRoles = (requiredRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.roles || req.user.roles.length === 0) {
            return res.status(403).json({ message: 'Access denied: User has no assigned roles.' });
        }

        if (req.user.roles.includes('Super Admin')) {
            return next();
        }

        const hasRequiredRole = req.user.roles.some(role => requiredRoles.includes(role));

        if (hasRequiredRole) {
            next();
        } else {
            return res.status(403).json({ message: 'Access denied: Insufficient permissions.' });
        }
    };
};

module.exports = {
    verifyToken,
    setTenantSchema, // New middleware
    authorizeRoles
};
