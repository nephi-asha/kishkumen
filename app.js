const express = require("express");
const cors = require("cors");
const routes = require("./router");
const handleError = require("./utils/errorHandler");
const { verifyToken, setTenantSchema } = require('./middleware/auth'); // Import new middleware

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.send('Welcome to the Bakery Backend API!');
});

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

// Authentication routes remain public
app.use('/api/auth', require('./router/auth-routes'));

// All routes that is below this line will require a valid JWT token
app.use('/api', verifyToken);

// All routes below this line will have the tenant schema set
// This must come AFTER verifyToken
app.use('/api', setTenantSchema);

// Mounts all other API routes (products, ingredients, users, etc.) under /api
// These routes will now automatically operate within the correct tenant schema so problem solved i guess 😂😂😂
app.use('/api', routes);

app.use((err, req, res, next) => {
    console.error("Global Error:", err.stack);
    handleError(res, err.statusCode || 500, err.message || "Something went wrong on the server");
});

module.exports = app;
