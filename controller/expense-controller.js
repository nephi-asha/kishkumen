const db = require('../database/db');
const handleError = require('../utils/errorHandler');


// Enum-like objects for validation
const VALID_STATUSES = ['Requested', 'Approved', 'Paid', 'Denied'];
const VALID_COST_TYPES = ['Fixed', 'Variable'];
const VALID_FREQUENCIES = ['One-time', 'Monthly', 'Yearly'];

// @desc    Get all expenses
// @route   GET /api/expenses?startDate=...&endDate=...&costType=...&category=...&status=...&isActive=...
// @access  Private (Store Owner, Admin, Baker)
exports.getAllExpenses = async (req, res) => {
    const { startDate, endDate, costType, category, status, isActive } = req.query;

    let query = `
        SELECT expense_id, expense_date, amount, description, category, cost_type, 
               frequency, status, is_active, created_at, updated_at
        FROM Expenses
    `;
    const queryParams = [];
    const conditions = [];
    let paramIndex = 1;

    if (startDate) {
        conditions.push(`expense_date >= $${paramIndex++}`);
        queryParams.push(startDate);
    }
    if (endDate) {
        conditions.push(`expense_date <= $${paramIndex++}`);
        queryParams.push(endDate);
    }
    if (costType) {
        conditions.push(`cost_type = $${paramIndex++}`);
        queryParams.push(costType);
    }
    if (category) {
        conditions.push(`category ILIKE $${paramIndex++}`); // Case-insensitive search
        queryParams.push(`%${category}%`);
    }
    if (status) {
        conditions.push(`status = $${paramIndex++}`);
        queryParams.push(status);
    }
    if (isActive !== undefined) {
        conditions.push(`is_active = $${paramIndex++}`);
        queryParams.push(isActive); // Will be 'true' or 'false'
    }

    if (conditions.length > 0) {
        query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY expense_date DESC`;

    try {
        const expenses = await db.query(query, queryParams);
        res.status(200).json(expenses.rows);
    } catch (error) {
        console.error('Error fetching expenses:', error);
        handleError(res, 500, 'Server error fetching expenses.');
    }
};

// @desc    Get a single expense by ID
// @route   GET /api/expenses/:id
// @access  Private (Store Owner, Admin, Baker)
exports.getExpenseById = async (req, res) => {
    const expenseId = parseInt(req.params.id);

    try {
        const expense = await db.query(
            `SELECT expense_id, expense_date, amount, description, category, cost_type, 
                    frequency, status, is_active, created_at, updated_at
             FROM Expenses
             WHERE expense_id = $1`,
            [expenseId]
        );

        if (expense.rows.length === 0) {
            return handleError(res, 404, 'Expense not found.');
        }
        res.status(200).json(expense.rows[0]);
    } catch (error) {
        console.error('Error fetching expense by ID:', error);
        handleError(res, 500, 'Server error fetching expense.');
    }
};

// @desc    Create a new expense (as a request)
// @route   POST /api/expenses
// @access  Private (Store Owner, Admin, Baker)
exports.createExpense = async (req, res) => {
    // is_active defaults to FALSE in the DB
    // status defaults to 'Requested' if not provided
    const { expense_date, amount, description, category, cost_type, frequency, status } = req.body;

    if (!amount || !cost_type) {
        return handleError(res, 400, 'Amount and cost type are required.');
    }

    if (!VALID_COST_TYPES.includes(cost_type)) {
         return handleError(res, 400, `Invalid cost type. Must be one of: ${VALID_COST_TYPES.join(', ')}`);
    }

    const effectiveStatus = status && VALID_STATUSES.includes(status) ? status : 'Requested';

    try {
        const newExpense = await db.query(
            `INSERT INTO Expenses (expense_date, amount, description, category, cost_type, frequency, status, is_active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
             RETURNING expense_id, expense_date, amount, category, cost_type, frequency, status, is_active`,
            [
                expense_date || new Date(), 
                amount, 
                description || null, 
                category || null, 
                cost_type, 
                frequency || 'One-time', 
                effectiveStatus,
                false // is_active is always false on creation
            ]
        );
        res.status(201).json({
            message: 'Expense recorded successfully!',
            expense: newExpense.rows[0]
        });
    } catch (error) {
        console.error('Error creating expense:', error);
        handleError(res, 500, 'Server error creating expense.');
    }
};

// @desc    Update an existing expense (status, details, or activation)
// @route   PUT /api/expenses/:id
// @access  Private (Store Owner, Admin)
exports.updateExpense = async (req, res) => {
    const expenseId = parseInt(req.params.id);
    const { expense_date, amount, description, category, cost_type, frequency, status, is_active } = req.body;

    try {
        // Get the current status of the expense
        const existingExpenseResult = await db.query(
            'SELECT expense_id, status FROM Expenses WHERE expense_id = $1',
            [expenseId]
        );
        if (existingExpenseResult.rows.length === 0) {
            return handleError(res, 404, 'Expense not found.');
        }

        const currentStatus = existingExpenseResult.rows[0].status;
        
        const effectiveStatus = (status !== undefined) ? status : currentStatus;

        if (is_active === true && effectiveStatus !== 'Paid') {
             return handleError(res, 400, 'Expense must be marked as "Paid" before it can be activated.');
        }

        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        if (expense_date !== undefined) { updateFields.push(`expense_date = $${paramIndex++}`); updateValues.push(expense_date); }
        if (amount !== undefined) { updateFields.push(`amount = $${paramIndex++}`); updateValues.push(amount); }
        if (description !== undefined) { updateFields.push(`description = $${paramIndex++}`); updateValues.push(description); }
        if (category !== undefined) { updateFields.push(`category = $${paramIndex++}`); updateValues.push(category); }
        
        if (cost_type !== undefined) {
            if (!VALID_COST_TYPES.includes(cost_type)) {
                return handleError(res, 400, `Invalid cost type. Must be one of: ${VALID_COST_TYPES.join(', ')}`);
            }
            updateFields.push(`cost_type = $${paramIndex++}`);
            updateValues.push(cost_type);
        }
        
        if (frequency !== undefined) {
            if (!VALID_FREQUENCIES.includes(frequency)) {
                return handleError(res, 400, `Invalid frequency. Must be one of: ${VALID_FREQUENCIES.join(', ')}`);
            }
            updateFields.push(`frequency = $${paramIndex++}`);
            updateValues.push(frequency);
        }

        if (status !== undefined) {
             if (!VALID_STATUSES.includes(status)) {
                return handleError(res, 400, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
            }
            updateFields.push(`status = $${paramIndex++}`);
            updateValues.push(status);
        }

        if (is_active !== undefined) {
            updateFields.push(`is_active = $${paramIndex++}`);
            updateValues.push(is_active);
        }

        if (updateFields.length === 0) {
            return handleError(res, 400, 'No fields provided for update.');
        }

        updateValues.push(expenseId);
        const updateQuery = `
            UPDATE Expenses
            SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE expense_id = $${paramIndex}
            RETURNING expense_id, amount, cost_type, frequency, status, is_active
        `;

        const updatedExpense = await db.query(updateQuery, updateValues);

        res.status(200).json({
            message: 'Expense updated successfully!',
            expense: updatedExpense.rows[0]
        });
    } catch (error) {
        console.error('Error updating expense:', error);
        handleError(res, 500, 'Server error updating expense.');
    }
};

// @desc    Delete an expense
// @route   DELETE /api/expenses/:id
// @access  Private (Store Owner, Admin)
exports.deleteExpense = async (req, res) => {
    const expenseId = parseInt(req.params.id);

    try {
        const deleteResult = await db.query(
            'DELETE FROM Expenses WHERE expense_id = $1 RETURNING expense_id',
            [expenseId]
        );

        if (deleteResult.rows.length === 0) {
            return handleError(res, 404, 'Expense not found or could not be deleted.');
        }

        res.status(200).json({ message: 'Expense deleted successfully!', expenseId: expenseId });
    } catch (error) {
        console.error('Error deleting expense:', error);
        handleError(res, 500, 'Server error deleting expense.');
    }
};
