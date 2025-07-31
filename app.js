const express = require("express");
const cors = require("cors");
const routes = require("./router"); 
const handleError = require("./utils/errorHandler"); 
const { verifyToken, setTenantSchema } = require('./middleware/auth');

// Swagger UI setup
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger'); 

const app = express();

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON request bodies

// Basic "Hello World" route
app.get('/', (req, res) => {
    res.send('Welcome to the Bakery Backend API!');
});

// Test Database Connection Route (still public)
app.get('/test-db', async (req, res) => {
    try {
        const db = require('./database/db');
        const result = await db.query('SELECT NOW() AS current_time;');
        res.status(200).json({
            message: 'Database connection successful!',
            currentTime: result.rows[0].current_time
        });
    } catch (error) {
        console.error('Database connection test failed:', error);
        handleError(res, 500, 'Database connection failed!');
    }
});

// Serve Swagger UI documentation
// This route should be public, as it's for documentation.
// Users will visit http://localhost:3000/api-docs to see your API docs.
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Authentication routes are public (login, register)
app.use('/api/auth', require('./router/auth-routes'));

// All routes below this line will require a valid JWT token
app.use('/api', verifyToken);

// All routes below this line will have the tenant schema set
// This middleware must come AFTER verifyToken
app.use('/api', setTenantSchema);

// Mount all other API routes (products, ingredients, etc.) under /api
// These routes will now automatically operate within the correct tenant schema
app.use('/api', routes); // routes from router/index.js (ingredients, products, etc.)

// Global Error Handler (MUST be the last middleware added)
app.use((err, req, res, next) => {
    console.error("Global Error:", err.stack);
    handleError(res, err.statusCode || 500, err.message || "Something went wrong on the server");
});

module.exports = app;
