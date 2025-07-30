const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db'); // Your database connection pool
const { body, validationResult } = require('express-validator');

// Helper function to fetch user roles
async function getUserRoles(userId) {
    const rolesResult = await db.query(
        `SELECT r.role_name
         FROM User_Roles ur
         JOIN Roles r ON ur.role_id = r.role_id
         WHERE ur.user_id = $1`,
        [userId]
    );
    return rolesResult.rows.map(row => row.role_name);
}

// SQL to create a new tenant's schema and its tables
// This will be executed dynamically for each new tenant
const TENANT_SCHEMA_SQL = `
    CREATE SCHEMA IF NOT EXISTS $1;

    CREATE TABLE $1.Products (
        product_id SERIAL PRIMARY KEY,
        product_name VARCHAR(100) NOT NULL,
        description TEXT,
        unit_price DECIMAL(10, 2) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE $1.Ingredients (
        ingredient_id SERIAL PRIMARY KEY,
        ingredient_name VARCHAR(100) UNIQUE NOT NULL,
        unit_of_measure VARCHAR(20),
        current_stock DECIMAL(10, 2) DEFAULT 0,
        reorder_level DECIMAL(10, 2),
        supplier VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE $1.Recipes (
        recipe_id SERIAL PRIMARY KEY,
        recipe_name VARCHAR(100) NOT NULL,
        description TEXT,
        batch_size VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE $1.Recipe_Ingredients (
        recipe_ingredient_id SERIAL PRIMARY KEY,
        recipe_id INT NOT NULL,
        ingredient_id INT NOT NULL,
        quantity DECIMAL(10, 2) NOT NULL,
        FOREIGN KEY (recipe_id) REFERENCES $1.Recipes(recipe_id) ON DELETE CASCADE,
        FOREIGN KEY (ingredient_id) REFERENCES $1.Ingredients(ingredient_id) ON DELETE RESTRICT
    );

    CREATE TABLE $1.Sales (
        sale_id SERIAL PRIMARY KEY,
        sale_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        total_amount DECIMAL(10, 2) NOT NULL,
        payment_method VARCHAR(50),
        cashier_user_id INT, -- Link to user who made the sale (if applicable)
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE $1.Sale_Items (
        sale_item_id SERIAL PRIMARY KEY,
        sale_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL,
        unit_price DECIMAL(10, 2) NOT NULL,
        FOREIGN KEY (sale_id) REFERENCES $1.Sales(sale_id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES $1.Products(product_id) ON DELETE RESTRICT
    );

    CREATE TABLE $1.Purchase_Requests (
        request_id SERIAL PRIMARY KEY,
        request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        requested_by_user_id INT NOT NULL,
        status VARCHAR(50) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Completed')),
        approval_required BOOLEAN DEFAULT FALSE, -- If owner approval is required
        approved_by_user_id INT,
        approval_date TIMESTAMP WITH TIME ZONE,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE $1.Purchase_Request_Items (
        request_item_id SERIAL PRIMARY KEY,
        request_id INT NOT NULL,
        ingredient_id INT NOT NULL,
        quantity_requested DECIMAL(10, 2) NOT NULL,
        unit_price_estimate DECIMAL(10, 2),
        FOREIGN KEY (request_id) REFERENCES $1.Purchase_Requests(request_id) ON DELETE CASCADE,
        FOREIGN KEY (ingredient_id) REFERENCES $1.Ingredients(ingredient_id) ON DELETE RESTRICT
    );

    -- Add triggers for updated_at columns in tenant schemas (if you have a generic function)
    -- Example for Products:
    -- CREATE TRIGGER update_products_updated_at
    -- BEFORE UPDATE ON $1.Products
    -- FOR EACH ROW
    -- EXECUTE FUNCTION update_updated_at_column();
`;


// Registration Route
router.post(
    '/register',
    [
        body('bakeryName').trim().notEmpty().withMessage('Bakery name is required.'),
        body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters long.'),
        body('email').isEmail().withMessage('Please enter a valid email address.'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long.')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ message: errors.array()[0].msg });
        }

        const { bakeryName, username, email, password } = req.body;
        const schemaName = `bakery_${bakeryName.toLowerCase().replace(/[^a-z0-9_]/g, '')}_${Date.now()}`; // Generate unique schema name

        try {
            // Check if bakery name or username already exists in the master database
            const existingTenant = await db.query('SELECT tenant_id FROM Tenants WHERE tenant_name = $1', [bakeryName]);
            if (existingTenant.rows.length > 0) {
                return res.status(409).json({ message: 'Bakery name already taken.' });
            }

            const existingUser = await db.query('SELECT user_id FROM Users WHERE username = $1', [username]);
            if (existingUser.rows.length > 0) {
                return res.status(409).json({ message: 'Username already taken.' });
            }

            const storeOwnerRoleResult = await db.query('SELECT role_id FROM Roles WHERE role_name = $1', ['Store Owner']);
            if (storeOwnerRoleResult.rows.length === 0) {
                return res.status(500).json({ message: 'System error: Store Owner role not configured.' });
            }
            const storeOwnerRoleId = storeOwnerRoleResult.rows[0].role_id;

            const hashedPassword = await bcrypt.hash(password, 10);

            // Start a master database transaction
            await db.pool.query('BEGIN');

            // 1. Insert new user (owner) first, without tenant_id initially
            const newUserResult = await db.query(
                'INSERT INTO Users (username, password_hash, email, first_name, last_name) VALUES ($1, $2, $3, $4, $5) RETURNING user_id, username',
                [username, hashedPassword, email, username, 'Owner']
            );
            const newUser = newUserResult.rows[0];
            const newUserId = newUser.user_id;

            // 2. Insert new tenant (bakery) into the master Tenants table
            const newTenantResult = await db.query(
                'INSERT INTO Tenants (tenant_name, schema_name, owner_user_id) VALUES ($1, $2, $3) RETURNING tenant_id',
                [bakeryName, schemaName, newUserId]
            );
            const tenantId = newTenantResult.rows[0].tenant_id;

            // 3. Update the newly created user to set their tenant_id
            await db.query(
                'UPDATE Users SET tenant_id = $1 WHERE user_id = $2',
                [tenantId, newUserId]
            );

            // 4. Assign 'Store Owner' role to the new user
            await db.query(
                'INSERT INTO User_Roles (user_id, role_id) VALUES ($1, $2)',
                [newUserId, storeOwnerRoleId]
            );

            // 5. Create the new schema for the tenant and provision their tables
            // IMPORTANT: Use a separate client for schema creation if the pool's default search_path is an issue
            // For simplicity, we'll use the main pool here, but be aware of potential search_path conflicts.
            // Also, replace '$1' in TENANT_SCHEMA_SQL with the actual schemaName for execution.
            const schemaCreationQueries = TENANT_SCHEMA_SQL.split(';').filter(q => q.trim().length > 0);
            for (const query of schemaCreationQueries) {
                await db.query(query.replace(/\$1/g, schemaName));
            }

            // Commit the master database transaction
            await db.pool.query('COMMIT');

            // Get all roles for the newly registered user
            const userRoles = await getUserRoles(newUserId);

            // Generate JWT token including all roles, tenantId, and schemaName
            const token = jwt.sign(
                {
                    userId: newUserId,
                    username: newUser.username,
                    roles: userRoles,
                    tenantId: tenantId,
                    schemaName: schemaName // Crucial for dynamic routing
                },
                process.env.JWT_SECRET,
                { expiresIn: '8h' }
            );

            res.status(201).json({
                message: 'Bakery and owner registered successfully!',
                token: token,
                user: {
                    id: newUserId,
                    username: newUser.username,
                    roles: userRoles,
                    tenantId: tenantId,
                    schemaName: schemaName
                }
            });

        } catch (error) {
            await db.pool.query('ROLLBACK');
            console.error('Registration error:', error);
            res.status(500).json({ message: 'Server error during registration. Please try again.' });
        }
    }
);

// Login Route
router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // Fetch user from the master database
        const userResult = await db.query('SELECT user_id, username, password_hash, tenant_id FROM Users WHERE username = $1', [username]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const user = userResult.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // Get tenant information from the master database
        const tenantResult = await db.query('SELECT schema_name FROM Tenants WHERE tenant_id = $1', [user.tenant_id]);
        if (tenantResult.rows.length === 0) {
            return res.status(500).json({ message: 'User associated with non-existent tenant.' });
        }
        const schemaName = tenantResult.rows[0].schema_name;

        // Get all roles for the logged-in user
        const userRoles = await getUserRoles(user.user_id);

        // Generate JWT token including all roles, tenantId, and schemaName
        const token = jwt.sign(
            {
                userId: user.user_id,
                username: user.username,
                roles: userRoles,
                tenantId: user.tenant_id,
                schemaName: schemaName // Crucial for dynamic routing
            },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.status(200).json({
            message: 'Login successful!',
            token: token,
            user: {
                id: user.user_id,
                username: user.username,
                roles: userRoles,
                tenantId: user.tenant_id,
                schemaName: schemaName
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login.' });
    }
});

module.exports = router;
