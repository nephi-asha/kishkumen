// my name is asha and i like to code and i also like a sister called betty

const db = require('../database/db');
const handleError = require('../utils/errorHandler');

// @desc    Get all purchase requests for the authenticated user's bakery
// @route   GET /api/purchase-requests
// @access  Private (Store Owner, Admin, Baker)
exports.getAllPurchaseRequests = async (req, res) => {
    const { status } = req.query; 

    let statusQuery = `
    SELECT
        ing.ingredient_id,
        ing.ingredient_name,
        ing.refill_amount,
        ing.cost_price,
        ps.status,
        ps.notes,
        ps.request_id,
        ps.request_date
    FROM ingredients as ing
    INNER JOIN purchase_request_items as prs
    ON ing.ingredient_id = prs.ingredient_id
    INNER JOIN purchase_requests as ps
    ON prs.request_id = ps.request_id `;

    const statusParams = [];

    if (status) {
        statusQuery += ` WHERE ps.status = $1`;
        statusParams.push(status);
    }

    statusQuery += ` ORDER BY ps.request_date DESC`;

    try {
        // It updates status to 'Completed' where refill_amount is zero and status is 'Approved'
        await db.query(`
            UPDATE purchase_requests
            SET status = 'Completed', updated_at = CURRENT_TIMESTAMP
            WHERE status = 'Approved' AND request_id IN (
                SELECT ps.request_id
                FROM purchase_requests ps
                INNER JOIN purchase_request_items prs ON ps.request_id = prs.request_id
                INNER JOIN ingredients ing ON prs.ingredient_id = ing.ingredient_id
                WHERE ing.refill_amount = 0 AND ps.status = 'Approved'
            )
        `);

        const statusResult = await db.query(statusQuery, statusParams);
        res.status(200).json(statusResult.rows);
    } catch (error) {
        console.error('Error fetching purchase requests:', error);
        handleError(res, 500, 'Server error fetching purchase requests.');
    } 
};




// @desc    Get a single purchase request by ID, including its items
// @route   GET /api/purchase-requests/:id
// @access  Private (Store Owner, Admin, Baker)
exports.getPurchaseRequestById = async (req, res) => {
    const requestId = parseInt(req.params.id);

    try {
        const requestResult = await db.query(
            `SELECT request_id, request_date, requested_by_user_id, status, approval_required, approved_by_user_id, approval_date, notes, created_at, updated_at
             FROM Purchase_Requests
             WHERE request_id = $1`,
            [requestId]
        );

        if (requestResult.rows.length === 0) {
            return handleError(res, 404, 'Purchase request not found.');
        }

        const request = requestResult.rows[0];

        // Fetch associated request items
        const requestItemsResult = await db.query(
            `SELECT pri.quantity_requested, pri.unit_price_estimate, i.ingredient_id, i.ingredient_name, i.unit_of_measure
             FROM Purchase_Request_Items pri
             JOIN Ingredients i ON pri.ingredient_id = i.ingredient_id
             WHERE pri.request_id = $1`,
            [requestId]
        );

        request.items = requestItemsResult.rows;
        res.status(200).json(request);
    } catch (error) {
        console.error('Error fetching purchase request by ID:', error);
        handleError(res, 500, 'Server error fetching purchase request.');
    }
};

// @desc    Create a new purchase request
// @route   POST /api/purchase-requests
// @access  Private (Store Owner, Admin, Baker)
exports.createPurchaseRequest = async (req, res) => {
    const { status, approval_required, notes, items, refill_amount } = req.body; // 'items' is an array of { ingredient_id, quantity_requested, unit_price_estimate }
    const requestedByUserId = req.user.userId;

    if (!Array.isArray(items) || items.length === 0) {
        return handleError(res, 400, 'At least one item is required for a purchase request.');
    }

    try {
        await db.pool.query('BEGIN');

        // Insert the new purchase request
        const newRequestResult = await db.query(
            `INSERT INTO Purchase_Requests (requested_by_user_id, status, approval_required, notes)
             VALUES ($1, $2, $3, $4) RETURNING request_id, request_date`,
            [requestedByUserId, status || 'Pending', approval_required || false, notes || null]
        );
        const newRequestId = newRequestResult.rows[0].request_id;

        // Insert purchase request items
        for (const item of items) {
            if (!item.ingredient_id || item.quantity_requested === undefined || item.quantity_requested === null) {
                throw new Error('Invalid purchase request item data provided.');
            }
            // Verify ingredient_id exists in the current tenant's Ingredients table
            const ingredientExists = await db.query('SELECT ingredient_id FROM Ingredients WHERE ingredient_id = $1', [item.ingredient_id]);
            if (ingredientExists.rows.length === 0) {
                throw new Error(`Ingredient with ID ${item.ingredient_id} not found.`);
            }

            await db.query(
                `INSERT INTO Purchase_Request_Items (request_id, ingredient_id, quantity_requested, unit_price_estimate)
                 VALUES ($1, $2, $3, $4)`,
                [newRequestId, item.ingredient_id, item.quantity_requested, item.unit_price_estimate || null]
            );
        }

        await db.pool.query('COMMIT');

        res.status(201).json({
            message: 'Purchase request created successfully!',
            request: newRequestResult.rows[0]
        });

    } catch (error) {
        await db.pool.query('ROLLBACK');
        console.error('Error creating purchase request:', error);
        handleError(res, 500, error.message || 'Server error creating purchase request.');
    }
};

exports.markAllRequestsApproved = async (req, res) => {
    const { userId: currentUserId, roles: currentUserRoles } = req.user;

    // Authorization: Only Store Owner/Admin can approve requests
    if (!currentUserRoles.includes('Store Owner') && !currentUserRoles.includes('Admin')) {
        return handleError(res, 403, 'Access denied: Only Store Owners or Admins can approve requests.');
    }

    try {
        await db.pool.query('BEGIN');

        // Get all pending purchase requests
        const pendingRequests = await db.query(
            `SELECT request_id FROM Purchase_Requests WHERE status = 'Pending'`
        );

        // For each pending request, update status and refill_amount
        for (const reqRow of pendingRequests.rows) {
            const requestId = reqRow.request_id;

            // Update the request status to Approved
            await db.query(
                `UPDATE Purchase_Requests SET status = 'Approved', approved_by_user_id = $1, approval_date = CURRENT_TIMESTAMP WHERE request_id = $2`,
                [currentUserId, requestId]
            );

            // Get all items for this request
            const itemsResult = await db.query(
                `SELECT ingredient_id, quantity_requested FROM Purchase_Request_Items WHERE request_id = $1`,
                [requestId]
            );

            // For each item, update the ingredient's refill_amount
            for (const item of itemsResult.rows) {
                await db.query(
                    `UPDATE Ingredients SET refill_amount = COALESCE(refill_amount,0) + $1 WHERE ingredient_id = $2`,
                    [item.quantity_requested, item.ingredient_id]
                );
            }
        }

        await db.pool.query('COMMIT');
        res.status(200).json({ message: 'All pending purchase requests have been approved and ingredient refill amounts updated.' });
    } catch (error) {
        await db.pool.query('ROLLBACK');
        console.error('Error marking all requests as approved:', error);
        handleError(res, 500, 'Server error marking all requests as approved.');
    }
};

exports.approveRequest = async (req, res) => {
    const { userId: currentUserId, roles: currentUserRoles } = req.user;

    // Authorization: Only Store Owner/Admin can approve requests
    if (!currentUserRoles.includes('Store Owner') && !currentUserRoles.includes('Admin')) {
        return handleError(res, 403, 'Access denied: Only Store Owners or Admins can approve requests.');
    }

    const requestId = parseInt(req.params.id);

    try {
        await db.pool.query('BEGIN');

        // Update the request status to Approved
        await db.query(
            `UPDATE Purchase_Requests SET status = 'Approved', approved_by_user_id = $1, approval_date = CURRENT_TIMESTAMP WHERE request_id = $2`,
            [currentUserId, requestId]
        );

        // Get all items for this request
        const itemsResult = await db.query(
            `SELECT ingredient_id, quantity_requested FROM Purchase_Request_Items WHERE request_id = $1`,
            [requestId]
        );

        // For each item, update the ingredient's refill_amount
        for (const item of itemsResult.rows) {
            await db.query(
                `UPDATE Ingredients SET refill_amount = COALESCE(refill_amount,0) + $1 WHERE ingredient_id = $2`,
                [item.quantity_requested, item.ingredient_id]
            );
        }

        await db.pool.query('COMMIT');
        res.status(200).json({ message: 'Purchase request approved and ingredient refill amounts updated.' });
    } catch (error) {
        await db.pool.query('ROLLBACK');
        console.error('Error approving purchase request:', error);
        handleError(res, 500, 'Server error approving purchase request.');
    }
};

exports.rejectRequest = async (req, res) => {
    const { userId: currentUserId, roles: currentUserRoles } = req.user;

    // Authorization: Only Store Owner/Admin can reject requests
    if (!currentUserRoles.includes('Store Owner') && !currentUserRoles.includes('Admin')) {
        return handleError(res, 403, 'Access denied: Only Store Owners or Admins can reject requests.');
    }

    const requestId = parseInt(req.params.id);

    try {
        await db.pool.query('BEGIN');

        // Update the request status to Rejected
        await db.query(
            `UPDATE Purchase_Requests SET status = 'Rejected', approved_by_user_id = $1, approval_date = CURRENT_TIMESTAMP WHERE request_id = $2`,
            [currentUserId, requestId]
        );

        await db.pool.query('COMMIT');
        res.status(200).json({ message: 'Purchase request rejected.' });
    } catch (error) {
        await db.pool.query('ROLLBACK');
        console.error('Error rejecting purchase request:', error);
        handleError(res, 500, 'Server error rejecting purchase request.');
    }
};

// @desc    Update an existing purchase request
// @route   PUT /api/purchase-requests/:id
// @access  Private (Store Owner, Admin, Baker) - status change for Owner/Admin
exports.updatePurchaseRequest = async (req, res) => {
    const requestId = parseInt(req.params.id);
    const { status, approval_required, approved_by_user_id, notes, items} = req.body;
    const { userId: currentUserId, roles: currentUserRoles } = req.user;


    try {
        const existingRequestResult = await db.query(
            'SELECT request_id, requested_by_user_id, status FROM Purchase_Requests WHERE request_id = $1',
            [requestId]
        );
        if (existingRequestResult.rows.length === 0) {
            return handleError(res, 404, 'Purchase request not found.');
        }

        const existingRequest = existingRequestResult.rows[0];
        let shouldUpdateRefill = false;

        // Authorization for status change: Only Store Owner/Admin can approve/reject
        if (status && status !== existingRequest.status) {
            if (!currentUserRoles.includes('Store Owner') && !currentUserRoles.includes('Admin')) {
                return handleError(res, 403, 'Access denied: Only Store Owners or Admins can change request status.');
            }
            // If status is changed from Pending to Approved, set flag to update refill_amount
            if (existingRequest.status === 'Pending' && status === 'Approved') {
                shouldUpdateRefill = true;
            }
            // If status is changed to Approved/Rejected, set approved_by_user_id and approval_date
            if (status === 'Approved' || status === 'Rejected') {
                req.body.approved_by_user_id = currentUserId;
                req.body.approval_date = new Date(); // Set current timestamp
            }
        }

        await db.pool.query('BEGIN');

        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        if (status !== undefined) { updateFields.push(`status = $${paramIndex++}`); updateValues.push(status); }
        if (approval_required !== undefined) { updateFields.push(`approval_required = $${paramIndex++}`); updateValues.push(approval_required); }
        if (req.body.approved_by_user_id !== undefined) { updateFields.push(`approved_by_user_id = $${paramIndex++}`); updateValues.push(req.body.approved_by_user_id); }
        if (req.body.approval_date !== undefined) { updateFields.push(`approval_date = $${paramIndex++}`); updateValues.push(req.body.approval_date); }
        if (notes !== undefined) { updateFields.push(`notes = $${paramIndex++}`); updateValues.push(notes); }

        if (updateFields.length > 0) {
            const updateQuery = `
                UPDATE purchase_requests
                SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE request_id = $${paramIndex}
                RETURNING request_id
            `;
            updateValues.push(requestId);
            await db.query(updateQuery, updateValues);
        }

        // If status changed from Pending to Approved, update refill_amount for each ingredient in the request
        if (shouldUpdateRefill) {
            // Get all items for this request
            const itemsResult = await db.query(
                `SELECT ingredient_id, quantity_requested FROM Purchase_Request_Items WHERE request_id = $1`,
                [requestId]
            );
            for (const item of itemsResult.rows) {
                await db.query(
                    `UPDATE Ingredients SET refill_amount = COALESCE(refill_amount,0) + $1 WHERE ingredient_id = $2`,
                    [item.quantity_requested, item.ingredient_id]
                );
            }
        }

        // Update request items if provided
        if (Array.isArray(items)) {
            await db.query('DELETE FROM Purchase_Request_Items WHERE request_id = $1', [requestId]);

            for (const item of items) {
                if (!item.ingredient_id || item.quantity_requested === undefined || item.quantity_requested === null) {
                    throw new Error('Invalid purchase request item data provided for update.');
                }
                const ingredientExists = await db.query('SELECT ingredient_id FROM Ingredients WHERE ingredient_id = $1', [item.ingredient_id]);
                if (ingredientExists.rows.length === 0) {
                    throw new Error(`Ingredient with ID ${item.ingredient_id} not found for update.`);
                }

                await db.query(
                    `INSERT INTO Purchase_Request_Items (request_id, ingredient_id, quantity_requested, unit_price_estimate)
                     VALUES ($1, $2, $3, $4)`,
                    [requestId, item.ingredient_id, item.quantity_requested, item.unit_price_estimate || null]
                );
            }
        }

        await db.pool.query('COMMIT');

        res.status(200).json({ message: 'Purchase request updated successfully!' });

    } catch (error) {
        await db.pool.query('ROLLBACK');
        console.error('Error updating purchase request:', error);
        handleError(res, 500, error.message || 'Server error updating purchase request.');
    }
};

// @desc    Delete a purchase request
// @route   DELETE /api/purchase-requests/:id
// @access  Private (Store Owner, Admin)
exports.deletePurchaseRequest = async (req, res) => {
    const requestId = parseInt(req.params.id);

    try {
        const existingRequest = await db.query(
            'SELECT request_id FROM Purchase_Requests WHERE request_id = $1',
            [requestId]
        );
        if (existingRequest.rows.length === 0) {
            return handleError(res, 404, 'Purchase request not found.');
        }

        await db.pool.query('BEGIN');
        await db.query('DELETE FROM Purchase_Request_Items WHERE request_id = $1', [requestId]);
        const deleteResult = await db.query(
            'DELETE FROM Purchase_Requests WHERE request_id = $1 RETURNING request_id',
            [requestId]
        );

        if (deleteResult.rows.length === 0) {
            throw new Error('Purchase request could not be deleted.');
        }
        await db.pool.query('COMMIT');

        res.status(200).json({ message: 'Purchase request deleted successfully!', requestId: requestId });
    } catch (error) {
        await db.pool.query('ROLLBACK');
        console.error('Error deleting purchase request:', error);
        handleError(res, 500, 'Server error deleting purchase request.');
    }
};
