const db = require('../database/db');
const handleError = require('../utils/errorHandler');

// @desc    Get all expenses for the authenticated user's bakery
// @route   GET /api/expenses?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD&costType=Fixed/Variable&category=Rent
// @access  Private (Store Owner, Admin, Baker)


exports.getAllExpenses = async (req, res) => {
    const { startDate, endDate, costType, category } = req.query;

    let query = `
        SELECT expense_id, expense_date, amount, description, category, cost_type, frequency, created_at, updated_at
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
            `SELECT expense_id, expense_date, amount, description, category, cost_type, frequency, created_at, updated_at
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

// @desc    Create a new expense
// @route   POST /api/expenses
// @access  Private (Store Owner, Admin, Baker)
exports.createExpense = async (req, res) => {
    const { expense_date, amount, description, category, cost_type } = req.body;

    if (!amount || !cost_type || !['Fixed', 'Variable'].includes(cost_type)) {
        return handleError(res, 400, 'Amount and a valid cost type (Fixed/Variable) are required.');
    }

    try {
        const newExpense = await db.query(
            `INSERT INTO Expenses (expense_date, amount, description, category, cost_type, frequency)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING expense_id, expense_date, amount, cost_type, frequency`,
            [expense_date || new Date(), amount, description || null, category || null, cost_type, frequency || 'One-time']
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

// @desc    Update an existing expense
// @route   PUT /api/expenses/:id
// @access  Private (Store Owner, Admin)
exports.updateExpense = async (req, res) => {
    const expenseId = parseInt(req.params.id);
    const { expense_date, amount, description, category, cost_type } = req.body;

    try {
        const existingExpense = await db.query(
            'SELECT expense_id FROM Expenses WHERE expense_id = $1',
            [expenseId]
        );
        if (existingExpense.rows.length === 0) {
            return handleError(res, 404, 'Expense not found.');
        }

        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        if (expense_date !== undefined) { updateFields.push(`expense_date = $${paramIndex++}`); updateValues.push(expense_date); }
        if (amount !== undefined) { updateFields.push(`amount = $${paramIndex++}`); updateValues.push(amount); }
        if (description !== undefined) { updateFields.push(`description = $${paramIndex++}`); updateValues.push(description); }
        if (category !== undefined) { updateFields.push(`category = $${paramIndex++}`); updateValues.push(category); }
        if (cost_type !== undefined) {
            if (!['Fixed', 'Variable'].includes(cost_type)) {
                return handleError(res, 400, 'Invalid cost type. Must be Fixed or Variable.');
            }
            updateFields.push(`cost_type = $${paramIndex++}`);
            updateValues.push(cost_type);
        }
        if (frequency !== undefined) {
            if (!['One-time', 'Monthly', 'Yearly'].includes(frequency)) {
                return handleError(res, 400, 'Invalid frequency. Must be One-time, Monthly, or Yearly.');
            }
            updateFields.push(`frequency = $${paramIndex++}`);
            updateValues.push(frequency);
        }

        if (updateFields.length === 0) {
            return handleError(res, 400, 'No fields provided for update.');
        }

        updateValues.push(expenseId); // Add expenseId for WHERE clause
        const updateQuery = `
            UPDATE Expenses
            SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE expense_id = $${paramIndex}
            RETURNING expense_id, amount, cost_type, frequency
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
        const existingExpense = await db.query(
            'SELECT expense_id FROM Expenses WHERE expense_id = $1',
            [expenseId]
        );
        if (existingExpense.rows.length === 0) {
            return handleError(res, 404, 'Expense not found.');
        }

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
