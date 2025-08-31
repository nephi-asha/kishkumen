const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
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

/**
 * @swagger
 * /register:
 *   post:
 *     summary: Register a new bakery and owner
 *     description: Creates a new bakery tenant and user account, and sets up a schema for the bakery.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bakeryName
 *               - username
 *               - email
 *               - password
 *             properties:
 *               bakeryName:
 *                 type: string
 *                 example: Sweet Delights
 *               username:
 *                 type: string
 *                 example: bakeryowner
 *               email:
 *                 type: string
 *                 format: email
 *                 example: owner@sweetdelights.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: strongPassword123
 *     responses:
 *       201:
 *         description: Bakery and owner registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Bakery and owner registered successfully!
 *                 token:
 *                   type: string
 *                   description: JWT token
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     username:
 *                       type: string
 *                       example: bakeryowner
 *                     roles:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: [ "Store Owner" ]
 *                     tenantId:
 *                       type: integer
 *                       example: 1001
 *                     schemaName:
 *                       type: string
 *                       example: bakery_sweetdelights_1722345678901
 *       400:
 *         description: Validation error (missing or invalid fields)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Username must be at least 3 characters long.
 *       409:
 *         description: Bakery name or username already taken
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Username already taken.
 *       500:
 *         description: Server error during registration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Server error during registration. Please try again.
 */

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
        const schemaName = `bakery_${bakeryName.toLowerCase().replace(/[^a-z0-9_]/g, '')}_${Date.now()}`;

        try {
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

            await db.pool.query('BEGIN');

            const newUserResult = await db.query(
                'INSERT INTO Users (username, password_hash, email, first_name, last_name) VALUES ($1, $2, $3, $4, $5) RETURNING user_id, username',
                [username, hashedPassword, email, username, 'Owner']
            );
            const newUser = newUserResult.rows[0];
            const newUserId = newUser.user_id;

            const newTenantResult = await db.query(
                'INSERT INTO Tenants (tenant_name, schema_name, owner_user_id) VALUES ($1, $2, $3) RETURNING tenant_id',
                [bakeryName, schemaName, newUserId]
            );
            const tenantId = newTenantResult.rows[0].tenant_id;

            await db.query(
                'UPDATE Users SET tenant_id = $1 WHERE user_id = $2',
                [tenantId, newUserId]
            );

            await db.query(
                'INSERT INTO User_Roles (user_id, role_id) VALUES ($1, $2)',
                [newUserId, storeOwnerRoleId]
            );

            // SQL to create a new tenant's schema and its tables
            // This will be executed dynamically for each new tenant
            const TENANT_SCHEMA_SQL = `
                CREATE SCHEMA IF NOT EXISTS $1;

                CREATE TABLE $1.Products (
                    product_id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
                    product_name VARCHAR(100) NOT NULL,
                    description TEXT,
                    unit_price DECIMAL(10, 2) NOT NULL,
                    cost_price DECIMAL(10, 2) DEFAULT 0.00,
                    is_active BOOLEAN DEFAULT TRUE,
                    recipe_id INT,
                    quantity_left INT DEFAULT 0,
                    sold_count INT DEFAULT 0,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE $1.Ingredients (
                    ingredient_id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
                    ingredient_name VARCHAR(100) UNIQUE NOT NULL,
                    unit_of_measure VARCHAR(20),
                    current_stock DECIMAL(10, 2) DEFAULT 0,
                    reorder_level DECIMAL(10, 2),
                    refill_amount DECIMAL(10, 2) DEFAULT 0.00,
                    supplier VARCHAR(100),
                    cost_price DECIMAL(10, 2) DEFAULT 0.00,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE $1.Recipes (
                    recipe_id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
                    recipe_name VARCHAR(100) NOT NULL,
                    description TEXT,
                    batch_size VARCHAR(50),
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE $1.Recipe_Ingredients (
                    recipe_ingredient_id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
                    recipe_id INT NOT NULL,
                    ingredient_id INT NOT NULL,
                    quantity DECIMAL(10, 2) NOT NULL,
                    FOREIGN KEY (recipe_id) REFERENCES $1.Recipes(recipe_id) ON DELETE CASCADE,
                    FOREIGN KEY (ingredient_id) REFERENCES $1.Ingredients(ingredient_id) ON DELETE RESTRICT
                );

                CREATE TABLE $1.Sales (
                    sale_id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
                    sale_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    total_amount DECIMAL(10, 2) NOT NULL,
                    payment_method VARCHAR(50),
                    cashier_user_id INT,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                CREATE TABLE $1.Sale_Items (
                    sale_item_id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
                    sale_id INT NOT NULL,
                    product_id INT NOT NULL,
                    quantity INT NOT NULL,
                    unit_price DECIMAL(10, 2) NOT NULL,
                    -- I'll be changing this cost_price to accept Null Values
                    cost_price DECIMAL(10, 2) DEFAULT NULL,
                    FOREIGN KEY (sale_id) REFERENCES $1.Sales(sale_id) ON DELETE CASCADE,
                    FOREIGN KEY (product_id) REFERENCES $1.Products(product_id) ON DELETE RESTRICT
                );

                CREATE TABLE $1.Purchase_Requests (
                    request_id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
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
                    request_item_id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
                    request_id INT NOT NULL,
                    ingredient_id INT NOT NULL,
                    quantity_requested DECIMAL(10, 2) NOT NULL,
                    unit_price_estimate DECIMAL(10, 2),
                    FOREIGN KEY (request_id) REFERENCES $1.Purchase_Requests(request_id) ON DELETE CASCADE,
                    FOREIGN KEY (ingredient_id) REFERENCES $1.Ingredients(ingredient_id) ON DELETE RESTRICT
                );

                -- NEW TABLE: Expenses
                CREATE TABLE $1.Expenses (
                    expense_id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
                    expense_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    amount DECIMAL(10, 2) NOT NULL,
                    description TEXT,
                    category VARCHAR(100), -- e.g., 'Rent', 'Utilities', 'Marketing', 'Salaries', 'Repairs'
                    frequency VARCHAR(50) DEFAULT 'One-time' CHECK (frequency IN ('One-time', 'Monthly', 'Yearly')),
                    cost_type VARCHAR(20) NOT NULL CHECK (cost_type IN ('Fixed', 'Variable')), -- Differentiates cost types
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
                );

                -- Add foreign key for Products.recipe_id
                ALTER TABLE $1.Products
                ADD CONSTRAINT fk_products_recipe
                FOREIGN KEY (recipe_id) REFERENCES $1.Recipes(recipe_id) ON DELETE SET NULL;
            `;


            const schemaCreationQueries = TENANT_SCHEMA_SQL.split(';').filter(q => q.trim().length > 0);
            for (const query of schemaCreationQueries) {
                await db.query(query.replace(/\$1/g, schemaName));
            }

            await db.pool.query('COMMIT');

            const userRoles = await getUserRoles(newUserId);

            const token = jwt.sign(
                {
                    userId: newUserId,
                    username: newUser.username,
                    roles: userRoles,
                    tenantId: tenantId,
                    schemaName: schemaName
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


/**
 * @swagger
 * /login:
 *   post:
 *     summary: User login
 *     description: Authenticates a user and returns a JWT token along with user info.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: johndoe
 *               password:
 *                 type: string
 *                 example: secret123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Login successful!
 *                 token:
 *                   type: string
 *                   description: JWT token
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     username:
 *                       type: string
 *                       example: johndoe
 *                     roles:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: [ "admin", "user" ]
 *                     tenantId:
 *                       type: integer
 *                       example: 101
 *                     schemaName:
 *                       type: string
 *                       example: tenant_101_schema
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Invalid credentials.
 *       500:
 *         description: Server error during login
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Server error during login.
 */

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const userResult = await db.query('SELECT user_id, username, password_hash, tenant_id FROM Users WHERE username = $1', [username]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const user = userResult.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const tenantResult = await db.query('SELECT schema_name FROM Tenants WHERE tenant_id = $1', [user.tenant_id]);
        if (tenantResult.rows.length === 0) {
            return res.status(500).json({ message: 'User associated with non-existent tenant.' });
        }
        const schemaName = tenantResult.rows[0].schema_name;

        const userRoles = await getUserRoles(user.user_id);

        const token = jwt.sign(
            {
                userId: user.user_id,
                username: user.username,
                roles: userRoles,
                tenantId: user.tenant_id,
                schemaName: schemaName
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
