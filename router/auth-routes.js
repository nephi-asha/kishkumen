const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { body, validationResult } = require('express-validator');

// Helper function to fetch user roles from the central public schema.
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

// SQL to create a new tenant-specific schema and all its tables.
// The '$1' placeholder will be replaced with the sanitized schema name
// by the db.query function.
const TENANT_SCHEMA_SQL = `
    CREATE SCHEMA IF NOT EXISTS $1;

    CREATE TABLE $1.Products (
        product_id SERIAL PRIMARY KEY,
        product_name VARCHAR(100) NOT NULL,
        description TEXT,
        unit_price DECIMAL(10, 2) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        recipe_id INT,
        quantity_left INT DEFAULT 0, 
        sold_count INT DEFAULT 0,  -- I will leave this here. It might come in handy
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
        cost_price DECIMAL(10, 2) DEFAULT 0.00,
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
        cashier_user_id INT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE $1.Sale_Items (
        sale_item_id SERIAL PRIMARY KEY,
        sale_id INT NOT NULL,
        product_id INT NOT NULL,
        quantity INT NOT NULL,
        unit_price DECIMAL(10, 2) NOT NULL,
        cost_price DECIMAL(10, 2) NOT NULL, -- Added to track cost for a specific sale item
        FOREIGN KEY (sale_id) REFERENCES $1.Sales(sale_id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES $1.Products(product_id) ON DELETE RESTRICT
    );

    CREATE TABLE $1.Purchase_Requests (
        request_id SERIAL PRIMARY KEY,
        request_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        requested_by_user_id INT NOT NULL,
        status VARCHAR(50) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Completed')),
        approval_required BOOLEAN DEFAULT FALSE,
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

    -- NEW TABLE: Expenses
    CREATE TABLE $1.Expenses (
        expense_id SERIAL PRIMARY KEY,
        expense_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        amount DECIMAL(10, 2) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        cost_type VARCHAR(20) NOT NULL CHECK (cost_type IN ('Fixed', 'Variable')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Add foreign key for Products.recipe_id
    ALTER TABLE $1.Products
    ADD CONSTRAINT fk_products_recipe
    FOREIGN KEY (recipe_id) REFERENCES $1.Recipes(recipe_id) ON DELETE SET NULL;
`;

// Helper to sanitize a string for use in a database schema name
function toSchemaName(bakeryName) {
    return bakeryName.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
}

router.post('/register', [
    body('firstName').notEmpty().withMessage('First name is required'),
    body('lastName').notEmpty().withMessage('Last name is required'),
    body('bakeryName').notEmpty().withMessage('Bakery name is required'),
    body('username').notEmpty().withMessage('Username is required'),
    body('email').isEmail().withMessage('Please provide a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { firstName, lastName, bakeryName, username, email, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        // Check if username or bakery name already exists in the central tables
        const existingUser = await db.query('SELECT user_id FROM Users WHERE username = $1', [username]);
        if (existingUser.rows.length > 0) {
            return res.status(400).json({ message: 'Username already exists.' });
        }

        const existingTenant = await db.query('SELECT tenant_id FROM Tenants WHERE bakery_name = $1', [bakeryName]);
        if (existingTenant.rows.length > 0) {
            return res.status(400).json({ message: 'Bakery name already exists.' });
        }

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            // Insert new tenant into the central Tenants table
            const schemaName = toSchemaName(bakeryName);
            const tenantResult = await client.query(
                'INSERT INTO Tenants (bakery_name, schema_name) VALUES ($1, $2) RETURNING tenant_id',
                [bakeryName, schemaName]
            );
            const tenantId = tenantResult.rows[0].tenant_id;

            // Create the new schema and all its tables
            // We use the db.query function here which will handle the '$1' substitution
            // The params array has to include the schema name as the first element for this to work
            await db.query(TENANT_SCHEMA_SQL, [schemaName], schemaName);

            // Insert the new user into the central Users table, linked to the new tenant
            const userResult = await client.query(
                'INSERT INTO Users (first_name, last_name, username, email, password_hash, tenant_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING user_id',
                [firstName, lastName, username, email, hashedPassword, tenantId]
            );
            const userId = userResult.rows[0].user_id;

            // Assign the 'Owner' role to the new user.
            const ownerRole = await client.query('SELECT role_id FROM Roles WHERE role_name = \'Owner\'');
            const ownerRoleId = ownerRole.rows[0].role_id;
            await client.query('INSERT INTO User_Roles (user_id, role_id) VALUES ($1, $2)', [userId, ownerRoleId]);

            await client.query('COMMIT');

            // Retrieve user roles and generate JWT
            const userRoles = await getUserRoles(userId);

            const token = jwt.sign(
                {
                    userId: userId,
                    username: username,
                    roles: userRoles,
                    tenantId: tenantId,
                    schemaName: schemaName // Include the schema name in the token payload.
                },
                process.env.JWT_SECRET,
                { expiresIn: '8h' }
            );

            res.status(201).json({
                message: 'Registration successful!',
                token: token,
                user: {
                    id: userId,
                    username: username,
                    roles: userRoles,
                    tenantId: tenantId,
                    schemaName: schemaName
                }
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Server error during registration.' });
    }
});


router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const userResult = await db.query('SELECT * FROM Users WHERE username = $1', [username]);

        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const user = userResult.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // Fetch the tenant's schema name based on the user's tenant_id
        const tenantResult = await db.query('SELECT schema_name FROM Tenants WHERE tenant_id = $1', [user.tenant_id]);
        if (tenantResult.rows.length === 0) {
            return res.status(500).json({ message: 'User associated with non-existent tenant.' });
        }
        const schemaName = tenantResult.rows[0].schema_name;

        // Fetch the user's roles from the public User_Roles table
        const userRoles = await getUserRoles(user.user_id);

        const token = jwt.sign(
            {
                userId: user.user_id,
                username: user.username,
                roles: userRoles,
                tenantId: user.tenant_id,
                schemaName: schemaName // Include the schema name in the token payload.
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
