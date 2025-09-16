const express = require("express");
const cors = require("cors");
const routes = require("./router");
const handleError = require("./utils/errorHandler");
const { verifyToken, setTenantSchema } = require('./middleware/auth');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Public routes that do not require any token or schema setup
app.get('/', (req, res) => res.send('Welcome to the Bakery Backend API!'));
app.get('/test-db', async (req, res) => { /* ... */ });
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// IMPORTANT: Authentication routes are public (login, register, approve-business)
// They must be handled BEFORE the verifyToken middleware.
// app.use('/api/auth', require('./router/auth-routes'));
app.use('/api/auth', require('./router/auth-routes'));


// All routes below this line will require a valid JWT token.
// The verifyToken and setTenantSchema middleware are now applied only to these routes.
app.use('/api', verifyToken, setTenantSchema, routes);

// Global Error Handler
app.use((err, req, res, next) => {
    console.error("Global Error:", err.stack);
    handleError(res, err.statusCode || 500, err.message || "Something went wrong on the server");
});

module.exports = app;