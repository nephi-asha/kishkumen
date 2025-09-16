const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

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

// Nodemailer setup
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

async function sendApprovalEmail(email, approvalLink) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'New Business Registration Awaiting Approval',
        html: `
            <p>A new business has registered and is awaiting your approval.</p>
            <p>Please review their details and approve their account by clicking the following link:</p>
            <a href="${approvalLink}">Approve Business</a>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Approval email sent to admin at ${email}`);
    } catch (error) {
        console.error(`Error sending approval email: ${error}`);
    }
}

async function sendActivationEmail(email) {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Your Account Has Been Activated',
        text: `Your business account has been approved and activated! You can now log in to the system.`,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Activation email sent to user at ${email}`);
    } catch (error) {
        console.error(`Error sending activation email: ${error}`);
    }
}

router.post(
    '/register',
    [
        body('firstName').trim().notEmpty().withMessage('First name is required.'),
        body('lastName').trim().notEmpty().withMessage('Last name is required.'),
        body('bakeryName').trim().notEmpty().withMessage('Business name is required.'),
        body('username').trim().isLength({ min: 3 }).withMessage('Username must be at least 3 characters long.'),
        body('email').isEmail().withMessage('Please enter a valid email address.'),
        body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long.')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ message: errors.array()[0].msg });
        }

        const { bakeryName, username, email, password, firstName, lastName } = req.body;
        
        try {
            // Check for existing business name, username, or email
            const existingTenant = await db.query('SELECT tenant_id FROM Tenants WHERE tenant_name = $1', [bakeryName]);
            if (existingTenant.rows.length > 0) {
                return res.status(409).json({ message: 'Business name already taken.' });
            }

            const existingUser = await db.query('SELECT user_id FROM Users WHERE username = $1 OR email = $2', [username, email]);
            if (existingUser.rows.length > 0) {
                return res.status(409).json({ message: 'Username or email already taken.' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const approvalToken = crypto.randomBytes(32).toString('hex'); // Generate a secure token
            const approvalLink = `${process.env.ADMIN_PORTAL_URL}/approve-business?token=${approvalToken}`;


            await db.pool.query('BEGIN');

            const newUserResult = await db.query(
                'INSERT INTO Users (username, password_hash, email, first_name, last_name, is_approved, approval_token) VALUES ($1, $2, $3, $4, $5, FALSE, $6) RETURNING user_id',
                [username, hashedPassword, email, firstName, lastName, approvalToken]
            );

            // Notify the admin of a new registration
            await sendApprovalEmail(process.env.ADMIN_EMAIL, approvalLink);

            await db.pool.query('COMMIT');

            res.status(202).json({
                message: 'Registration received. Your account is pending approval by an administrator. You will be notified via email once your account is activated.'
            });

        } catch (error) {
            await db.pool.query('ROLLBACK');
            console.error('Registration error:', error);
            res.status(500).json({ message: 'Server error during registration. Please try again.' });
        }
    }
);

router.post('/approve-business', async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).json({ message: 'Approval token is required.' });
    }

    try {
        const userResult = await db.query(
            'SELECT user_id, username, email FROM Users WHERE approval_token = $1 AND is_approved = FALSE',
            [token]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ message: 'Invalid or expired approval token.' });
        }

        const user = userResult.rows[0];
        const { user_id, username, email } = user;
        const bakeryName = username; // Or fetch from a separate registration-specific table if you prefer

        // Start a transaction for the entire approval process
        await db.pool.query('BEGIN');

        // Now, proceed with creating the tenant and the schema
        const schemaName = `bakery_${bakeryName.toLowerCase().replace(/[^a-z0-9_]/g, '')}_${Date.now()}`;
        
        // Find the 'Store Owner' role ID
        const storeOwnerRoleResult = await db.query('SELECT role_id FROM Roles WHERE role_name = $1', ['Store Owner']);
        if (storeOwnerRoleResult.rows.length === 0) {
            throw new Error('System error: Store Owner role not configured.');
        }
        const storeOwnerRoleId = storeOwnerRoleResult.rows[0].role_id;

        const newTenantResult = await db.query(
            'INSERT INTO Tenants (tenant_name, schema_name, owner_user_id) VALUES ($1, $2, $3) RETURNING tenant_id',
            [bakeryName, schemaName, user_id]
        );
        const tenantId = newTenantResult.rows[0].tenant_id;

        await db.query(
            'UPDATE Users SET tenant_id = $1, is_approved = TRUE, approval_token = NULL WHERE user_id = $2',
            [tenantId, user_id]
        );

        await db.query(
            'INSERT INTO User_Roles (user_id, role_id) VALUES ($1, $2)',
            [user_id, storeOwnerRoleId]
        );

        // SQL to create a new tenant's schema and its tables
        const TENANT_SCHEMA_SQL = `
            CREATE SCHEMA IF NOT EXISTS $1;

            CREATE TABLE $1.Products (
                product_id SERIAL PRIMARY KEY,
                product_name VARCHAR(100) NOT NULL,
                description TEXT,
                unit_price DECIMAL(10, 2) NOT NULL,
                cost_price DECIMAL(10, 2) DEFAULT 0.00,
                is_active BOOLEAN DEFAULT TRUE,
                recipe_id INT,
                quantity_left INT DEFAULT 0,
                sold_count INT DEFAULT 0,
                defect_count INT DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE $1.Ingredients (
                ingredient_id SERIAL PRIMARY KEY,
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
                cost_price DECIMAL(10, 2) DEFAULT NULL,
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

            CREATE TABLE $1.Expenses (
                expense_id SERIAL PRIMARY KEY,
                expense_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                amount DECIMAL(10, 2) NOT NULL,
                description TEXT,
                category VARCHAR(100),
                frequency VARCHAR(50) DEFAULT 'One-time' CHECK (frequency IN ('One-time', 'Monthly', 'Yearly')),
                cost_type VARCHAR(20) NOT NULL CHECK (cost_type IN ('Fixed', 'Variable')),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE $1.restocks (
                restock_id serial PRIMARY KEY,
                product_id integer NOT NULL REFERENCES $1.products(product_id),
                restock_value DECIMAL(10, 5) NOT NULL,
                created_at TIMESTAMP with time zone DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE $1.Defects (
                defect_id BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
                product_id INTEGER NULL,
                defect_count BIGINT NULL,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                CONSTRAINT defects_pkey PRIMARY KEY (defect_id),
                CONSTRAINT defects_product_id_fkey FOREIGN KEY (product_id) REFERENCES $1.products (product_id) ON UPDATE CASCADE ON DELETE CASCADE
            );

            CREATE TABLE $1.overstocks (
                overtstock_id BIGINT GENERATED BY DEFAULT AS IDENTITY NOT NULL,
                product_id INTEGER NOT NULL,
                quantity_left BIGINT NULL,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
                CONSTRAINT overstocks_pkey PRIMARY KEY (overtstock_id),
                CONSTRAINT overstocks_product_id_fkey FOREIGN KEY (product_id) REFERENCES $1.products (product_id) ON UPDATE CASCADE ON DELETE CASCADE
            );

            ALTER TABLE $1.Products
            ADD CONSTRAINT fk_products_recipe
            FOREIGN KEY (recipe_id) REFERENCES $1.Recipes(recipe_id) ON DELETE SET NULL;
        `;

        const schemaCreationQueries = TENANT_SCHEMA_SQL.split(';').filter(q => q.trim().length > 0);
        for (const query of schemaCreationQueries) {
            await db.query(query.replace(/\$1/g, schemaName));
        }

        await db.pool.query('COMMIT');

        // Notify the user that their account is activated
        await sendActivationEmail(email);

        res.status(200).json({ message: 'Business account approved and activated successfully!' });

    } catch (error) {
        await db.pool.query('ROLLBACK');
        console.error('Approval error:', error);
        res.status(500).json({ message: 'Server error during approval. Please try again.' });
    }
});


router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const userResult = await db.query('SELECT user_id, username, password_hash, tenant_id, is_approved FROM Users WHERE username = $1', [username]);
        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const user = userResult.rows[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        if (!user.is_approved) {
            return res.status(403).json({ message: 'Your account is pending approval. Please check back later.' });
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