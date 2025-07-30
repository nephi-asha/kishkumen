const db = require('../database/db');
const bcrypt = require('bcryptjs');
const handleError = require('../utils/errorHandler');

// Helper to get role_id from role_name
async function getRoleId(roleName) {
    const result = await db.query('SELECT role_id FROM Roles WHERE role_name = $1', [roleName]);
    return result.rows.length > 0 ? result.rows[0].role_id : null;
}

// Helper to assign roles to a user
async function assignRolesToUser(userId, roles) {
    if (!Array.isArray(roles) || roles.length === 0) {
        return;
    }

    await db.query('DELETE FROM User_Roles WHERE user_id = $1', [userId]);

    for (const roleName of roles) {
        const roleId = await getRoleId(roleName);
        if (roleId) {
            await db.query('INSERT INTO User_Roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT (user_id, role_id) DO NOTHING', [userId, roleId]);
        } else {
            console.warn(`Role '${roleName}' not found for assignment to user ${userId}.`);
        }
    }
}

// @desc    Add a new staff member to a bakery (by Store Owner/Admin)
// @route   POST /api/users/add-staff
// @access  Private (Store Owner, Admin)
exports.addStaffMember = async (req, res) => {
    const { username, email, password, firstName, lastName, roles } = req.body;
    const tenantId = req.user.tenantId;

    if (roles && (roles.includes('Store Owner') || roles.includes('Super Admin'))) {
        return handleError(res, 403, 'Cannot assign Store Owner or Super Admin role via this endpoint.');
    }

    try {
        const existingUser = await db.query('SELECT user_id FROM Users WHERE username = $1', [username]);
        if (existingUser.rows.length > 0) {
            return handleError(res, 409, 'Username already taken.');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await db.pool.query('BEGIN');

        // Changed column name from bakery_id to tenant_id
        const newUserResult = await db.query(
            'INSERT INTO Users (username, password_hash, email, first_name, last_name, tenant_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING user_id',
            [username, hashedPassword, email, firstName, lastName, tenantId]
        );
        const newUserId = newUserResult.rows[0].user_id;

        await assignRolesToUser(newUserId, roles);

        await db.pool.query('COMMIT');

        res.status(201).json({ message: 'Staff member added successfully!', userId: newUserId });

    } catch (error) {
        await db.pool.query('ROLLBACK');
        console.error('Error adding staff member:', error);
        handleError(res, 500, 'Server error during staff member creation.');
    }
};

// @desc    Get all users for the authenticated user's bakery
// @route   GET /api/users/my-bakery
// @access  Private (Any authenticated user within a bakery)
exports.getBakeryUsers = async (req, res) => {
    const tenantId = req.user.tenantId; // Changed from bakeryId to tenantId

    if (!tenantId) {
        return handleError(res, 403, 'Access denied: User not associated with a tenant.');
    }

    try {
        // Query Users table by tenant_id
        const usersResult = await db.query(
            `SELECT u.user_id, u.username, u.email, u.first_name, u.last_name,
                    ARRAY_AGG(r.role_name) AS roles
             FROM Users u
             LEFT JOIN User_Roles ur ON u.user_id = ur.user_id
             LEFT JOIN Roles r ON ur.role_id = r.role_id
             WHERE u.tenant_id = $1 -- Changed from bakery_id to tenant_id
             GROUP BY u.user_id
             ORDER BY u.username`,
            [tenantId]
        );
        res.status(200).json(usersResult.rows);
    } catch (error) {
        console.error('Error fetching bakery users:', error);
        handleError(res, 500, 'Server error fetching users for this bakery.');
    }
};

// @desc    Get a single user by ID (scoped to bakery or Super Admin)
// @route   GET /api/users/:id
// @access  Private (User themselves, Store Owner/Admin within same bakery, Super Admin)
exports.getUserById = async (req, res) => {
    const targetUserId = parseInt(req.params.id);
    const { userId: currentUserId, tenantId: currentUserTenantId, roles: currentUserRoles } = req.user; // Changed from bakeryId to tenantId

    try {
        // Fetch user and their tenant_id
        const userResult = await db.query(
            `SELECT u.user_id, u.username, u.email, u.first_name, u.last_name, u.tenant_id, -- Changed from bakery_id to tenant_id
                    ARRAY_AGG(r.role_name) AS roles
             FROM Users u
             LEFT JOIN User_Roles ur ON u.user_id = ur.user_id
             LEFT JOIN Roles r ON ur.role_id = r.role_id
             WHERE u.user_id = $1
             GROUP BY u.user_id`,
            [targetUserId]
        );

        if (userResult.rows.length === 0) {
            return handleError(res, 404, 'User not found.');
        }

        const user = userResult.rows[0];

        // Authorization logic:
        // 1. Super Admin can view any user.
        // 2. User can view their own profile.
        // 3. Store Owner/Admin can view users within their own tenant.
        if (currentUserRoles.includes('Super Admin') ||
            currentUserId === targetUserId ||
            (currentUserRoles.includes('Store Owner') || currentUserRoles.includes('Admin')) && user.tenant_id === currentUserTenantId) { // Changed from bakery_id to tenant_id
            res.status(200).json(user);
        } else {
            handleError(res, 403, 'Access denied: You do not have permission to view this user.');
        }

    } catch (error) {
        console.error('Error fetching user by ID:', error);
        handleError(res, 500, 'Server error fetching user.');
    }
};

// @desc    Update a user's profile or roles (scoped to bakery or Super Admin)
// @route   PUT /api/users/:id
// @access  Private (User themselves, Store Owner/Admin within same bakery, Super Admin)
exports.updateUser = async (req, res) => {
    const targetUserId = parseInt(req.params.id);
    const { username, email, firstName, lastName, password, roles } = req.body;
    const { userId: currentUserId, tenantId: currentUserTenantId, roles: currentUserRoles } = req.user; // Changed from bakeryId to tenantId

    try {
        // Fetch user's tenant_id
        const userToUpdateResult = await db.query('SELECT tenant_id FROM Users WHERE user_id = $1', [targetUserId]); // Changed from bakery_id to tenant_id
        if (userToUpdateResult.rows.length === 0) {
            return handleError(res, 404, 'User not found.');
        }
        const userTenantId = userToUpdateResult.rows[0].tenant_id; // Changed from userBakeryId to userTenantId

        // Authorization check:
        const isSuperAdmin = currentUserRoles.includes('Super Admin');
        const isSelfUpdate = currentUserId === targetUserId;
        // Changed from userBakeryId === currentUserBakeryId to userTenantId === currentUserTenantId
        const isTenantAdmin = (currentUserRoles.includes('Store Owner') || currentUserRoles.includes('Admin')) && userTenantId === currentUserTenantId;

        if (!isSuperAdmin && !isSelfUpdate && !isTenantAdmin) {
            return handleError(res, 403, 'Access denied: You do not have permission to update this user.');
        }

        if (roles && !isSuperAdmin) {
            if (roles.includes('Store Owner') || roles.includes('Super Admin')) {
                return handleError(res, 403, 'Access denied: Cannot assign Store Owner or Super Admin role.');
            }
            const targetUserRolesResult = await db.query(`
                SELECT r.role_name FROM User_Roles ur JOIN Roles r ON ur.role_id = r.role_id WHERE ur.user_id = $1
            `, [targetUserId]);
            const targetUserRoles = targetUserRolesResult.rows.map(row => row.role_name);
            if ((targetUserRoles.includes('Store Owner') || targetUserRoles.includes('Super Admin')) && !isSuperAdmin) {
                 return handleError(res, 403, 'Access denied: Cannot modify roles of other Store Owners or Super Admins.');
            }
        }

        let hashedPassword;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        await db.pool.query('BEGIN');

        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        if (username) { updateFields.push(`username = $${paramIndex++}`); updateValues.push(username); }
        if (email) { updateFields.push(`email = $${paramIndex++}`); updateValues.push(email); }
        if (firstName) { updateFields.push(`first_name = $${paramIndex++}`); updateValues.push(firstName); }
        if (lastName) { updateFields.push(`last_name = $${paramIndex++}`); updateValues.push(lastName); }
        if (hashedPassword) { updateFields.push(`password_hash = $${paramIndex++}`); updateValues.push(hashedPassword); }

        if (updateFields.length > 0) {
            const updateQuery = `UPDATE Users SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE user_id = $${paramIndex} RETURNING user_id`;
            updateValues.push(targetUserId);
            await db.query(updateQuery, updateValues);
        }

        if (roles && (isSuperAdmin || isTenantAdmin)) { // Changed from isBakeryAdmin to isTenantAdmin
            await assignRolesToUser(targetUserId, roles);
        }

        await db.pool.query('COMMIT');

        res.status(200).json({ message: 'User updated successfully!' });

    } catch (error) {
        await db.pool.query('ROLLBACK');
        console.error('Error updating user:', error);
        handleError(res, 500, 'Server error during user update.');
    }
};

// @desc    Delete a user (scoped to bakery or Super Admin)
// @route   DELETE /api/users/:id
// @access  Private (Store Owner/Admin within same bakery, Super Admin)
exports.deleteUser = async (req, res) => {
    const targetUserId = parseInt(req.params.id);
    const { userId: currentUserId, tenantId: currentUserTenantId, roles: currentUserRoles } = req.user; // Changed from bakeryId to tenantId

    if (currentUserId === targetUserId) {
        return handleError(res, 403, 'Access denied: You cannot delete your own account.');
    }

    try {
        // Fetch user's tenant_id
        const userToDeleteResult = await db.query(
            `SELECT u.tenant_id, ARRAY_AGG(r.role_name) AS roles -- Changed from bakery_id to tenant_id
             FROM Users u
             LEFT JOIN User_Roles ur ON u.user_id = ur.user_id
             LEFT JOIN Roles r ON ur.role_id = r.role_id
             WHERE u.user_id = $1
             GROUP BY u.user_id`,
            [targetUserId]
        );

        if (userToDeleteResult.rows.length === 0) {
            return handleError(res, 404, 'User not found.');
        }

        const userToDelete = userToDeleteResult.rows[0];
        const userTenantId = userToDelete.tenant_id; // Changed from userBakeryId to userTenantId
        const targetUserRoles = userToDelete.roles;

        const isSuperAdmin = currentUserRoles.includes('Super Admin');
        // Changed from userBakeryId === currentUserBakeryId to userTenantId === currentUserTenantId
        const isTenantAdmin = (currentUserRoles.includes('Store Owner') || currentUserRoles.includes('Admin')) && userTenantId === currentUserTenantId;

        if (!isSuperAdmin && !isTenantAdmin) {
            return handleError(res, 403, 'Access denied: You do not have permission to delete this user.');
        }

        if (!isSuperAdmin && (targetUserRoles.includes('Store Owner') || targetUserRoles.includes('Super Admin'))) {
            return handleError(res, 403, 'Access denied: Cannot delete other Store Owners or Super Admins.');
        }

        await db.pool.query('BEGIN');
        await db.query('DELETE FROM User_Roles WHERE user_id = $1', [targetUserId]);
        await db.query('DELETE FROM Users WHERE user_id = $1', [targetUserId]);
        await db.pool.query('COMMIT');

        res.status(200).json({ message: 'User deleted successfully!' });

    } catch (error) {
        await db.pool.query('ROLLBACK');
        console.error('Error deleting user:', error);
        handleError(res, 500, 'Server error during user deletion.');
    }
};

// @desc    Get all users across all bakeries (Super Admin only)
// @route   GET /api/users/all-bakeries-users
// @access  Private (Super Admin)
exports.getAllUsersSuperAdmin = async (req, res) => {
    try {
        // Fetches users and joins with Tenants table to get tenant_name
        const usersResult = await db.query(
            `SELECT u.user_id, u.username, u.email, u.first_name, u.last_name, u.tenant_id, t.tenant_name, -- Changed from bakery_id to tenant_id, and bakery_name to tenant_name
                    ARRAY_AGG(r.role_name) AS roles
             FROM Users u
             LEFT JOIN User_Roles ur ON u.user_id = ur.user_id
             LEFT JOIN Roles r ON ur.role_id = r.role_id
             LEFT JOIN Tenants t ON u.tenant_id = t.tenant_id -- Changed from Bakeries b ON u.bakery_id = b.bakery_id
             GROUP BY u.user_id, t.tenant_name -- Changed from b.bakery_name to t.tenant_name
             ORDER BY u.username`
        );
        res.status(200).json(usersResult.rows);
    } catch (error) {
        console.error('Error fetching all users for Super Admin:', error);
        handleError(res, 500, 'Server error fetching all users.');
    }
};

// @desc    Update user roles (Super Admin or Store Owner)
// @route   PUT /api/users/:id/roles
// @access  Private (Store Owner, Super Admin)
exports.updateUserRoles = async (req, res) => {
    const targetUserId = parseInt(req.params.id);
    const { roles } = req.body;
    const { userId: currentUserId, tenantId: currentUserTenantId, roles: currentUserRoles } = req.user; // Changed from bakeryId to tenantId

    if (!Array.isArray(roles) || roles.length === 0) {
        return handleError(res, 400, 'Roles array is required and cannot be empty.');
    }

    try {
        // Fetch user's tenant_id
        const userToUpdateResult = await db.query(
            `SELECT u.tenant_id, ARRAY_AGG(r.role_name) AS current_target_roles -- Changed from bakery_id to tenant_id
             FROM Users u
             LEFT JOIN User_Roles ur ON u.user_id = ur.user_id
             LEFT JOIN Roles r ON ur.role_id = r.role_id
             WHERE u.user_id = $1
             GROUP BY u.user_id`,
            [targetUserId]
        );

        if (userToUpdateResult.rows.length === 0) {
            return handleError(res, 404, 'User not found.');
        }
        const userTenantId = userToUpdateResult.rows[0].tenant_id; // Changed from userBakeryId to userTenantId
        const currentTargetRoles = userToUpdateResult.rows[0].current_target_roles;

        const isSuperAdmin = currentUserRoles.includes('Super Admin');
        const isStoreOwner = currentUserRoles.includes('Store Owner');

        if (!isSuperAdmin && !isStoreOwner) {
            return handleError(res, 403, 'Access denied: Only Super Admins or Store Owners can modify user roles.');
        }

        // Changed from userBakeryId !== currentUserBakeryId to userTenantId !== currentUserTenantId
        if (isStoreOwner && userTenantId !== currentUserTenantId) {
            return handleError(res, 403, 'Access denied: Store Owners can only modify roles of users in their own tenant.');
        }

        if (!isSuperAdmin) {
            if (roles.includes('Store Owner') || roles.includes('Super Admin')) {
                return handleError(res, 403, 'Access denied: Only Super Admin can assign Store Owner or Super Admin roles.');
            }
            if (currentTargetRoles.includes('Store Owner') || currentTargetRoles.includes('Super Admin')) {
                return handleError(res, 403, 'Access denied: Only Super Admin can modify roles of existing Store Owners or Super Admins.');
            }
        }

        await db.pool.query('BEGIN');
        await assignRolesToUser(targetUserId, roles);
        await db.pool.query('COMMIT');

        res.status(200).json({ message: 'User roles updated successfully!' });

    } catch (error) {
        await db.pool.query('ROLLBACK');
        console.error('Error updating user roles:', error);
        handleError(res, 500, 'Server error during user role update.');
    }
};
