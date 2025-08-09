const db = require('../database/db');
const handleError = require('../utils/errorHandler');

// @desc    Get all sales for the authenticated user's bakery, with optional date filtering and nested items
// @route   GET /api/sales?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
// @access  Private (Any authenticated user within a bakery)
exports.getAllSales = async (req, res) => {
    const { startDate, endDate } = req.query; // Extract startDate and endDate from query parameters

    let salesQuery = `
        SELECT sale_id, sale_date, total_amount, payment_method, cashier_user_id, created_at, updated_at
        FROM Sales
    `;
    const salesQueryParams = [];
    let paramIndex = 1;

    // Add WHERE clause for date filtering if parameters are provided
    if (startDate || endDate) {
        salesQuery += ` WHERE `;
        if (startDate) {
            salesQuery += `sale_date >= $${paramIndex++}`;
            salesQueryParams.push(startDate);
        }
        if (startDate && endDate) {
            salesQuery += ` AND `;
        }
        if (endDate) {
            salesQuery += `sale_date <= $${paramIndex++}`;
            salesQueryParams.push(endDate);
        }
    }

    salesQuery += ` ORDER BY sale_date DESC`; // Always order by date

    try {
        const salesResult = await db.query(salesQuery, salesQueryParams);
        const sales = salesResult.rows;

        // For each sale, fetch its associated items and product details, including cost_price
        for (let i = 0; i < sales.length; i++) {
            const sale = sales[i];
            const saleItemsResult = await db.query(
                `SELECT si.quantity, si.unit_price, p.product_id, p.product_name, p.cost_price
                 FROM Sale_Items si
                 JOIN Products p ON si.product_id = p.product_id
                 WHERE si.sale_id = $1`,
                [sale.sale_id]
            );
            sale.items = saleItemsResult.rows; // Attach the fetched items to the current sale object
        }

        res.status(200).json(sales); // Send the sales array with nested items
    } catch (error) {
        console.error('Error fetching sales:', error);
        handleError(res, 500, 'Server error fetching sales.');
    }
};

// @desc    Get a single sale by ID, including its items
// @route   GET /api/sales/:id
// @access  Private (Any authenticated user within a bakery)
exports.getSaleById = async (req, res) => {
    const saleId = parseInt(req.params.id);

    try {
        const saleResult = await db.query(
            `SELECT sale_id, sale_date, total_amount, payment_method, cashier_user_id, created_at, updated_at
             FROM Sales
             WHERE sale_id = $1`,
            [saleId]
        );

        if (saleResult.rows.length === 0) {
            return handleError(res, 404, 'Sale not found.');
        }

        const sale = saleResult.rows[0];

        const saleItemsResult = await db.query(
            `SELECT si.quantity, si.unit_price, p.product_id, p.product_name, p.cost_price -- Added p.cost_price
             FROM Sale_Items si
             JOIN Products p ON si.product_id = p.product_id
             WHERE si.sale_id = $1`,
            [saleId]
        );

        sale.items = saleItemsResult.rows;
        res.status(200).json(sale);
    } catch (error) {
        console.error('Error fetching sale by ID:', error);
        handleError(res, 500, 'Server error fetching sale.');
    }
};

// @desc    Create a new sale
// @route   POST /api/sales
// @access  Private (Store Owner, Admin, Cashier)
exports.createSale = async (req, res) => {
    const { total_amount, payment_method, items } = req.body; // 'items' is an array of { product_id, quantity, unit_price }
    const cashierUserId = req.user.userId; // User who is making the sale

    if (!total_amount || !payment_method || !Array.isArray(items) || items.length === 0) {
        return handleError(res, 400, 'Total amount, payment method, and at least one item are required.');
    }

    try {
        await db.pool.query('BEGIN');

        // Insert the new sale
        const newSaleResult = await db.query(
            `INSERT INTO Sales (total_amount, payment_method, cashier_user_id)
             VALUES ($1, $2, $3) RETURNING sale_id, sale_date`,
            [total_amount, payment_method, cashierUserId]
        );
        const newSaleId = newSaleResult.rows[0].sale_id;

        // Insert sale items
        for (const item of items) {
            if (!item.product_id || item.quantity === undefined || item.quantity === null || item.unit_price === undefined || item.unit_price === null) {
                throw new Error('Invalid sale item data provided.');
            }
            // Verify product_id exists in the current tenant's Products table
            const productExists = await db.query('SELECT product_id FROM Products WHERE product_id = $1', [item.product_id]);
            if (productExists.rows.length === 0) {
                throw new Error(`Product with ID ${item.product_id} not found.`);
            }

            await db.query(
                `INSERT INTO Sale_Items (sale_id, product_id, quantity, unit_price)
                 VALUES ($1, $2, $3, $4)`,
                [newSaleId, item.product_id, item.quantity, item.unit_price]
            );

            // Update product quantity_left count
            await db.query(
                `UPDATE Products
                 SET quantity_left = quantity_left - $1
                 WHERE product_id = $2`,
                [item.quantity, item.product_id]
            );
        }

        await db.pool.query('COMMIT');

        res.status(201).json({
            message: 'Sale recorded successfully!',
            sale: newSaleResult.rows[0]
        });

    } catch (error) {
        await db.pool.query('ROLLBACK');
        console.error('Error creating sale:', error);
        handleError(res, 500, error.message || 'Server error creating sale.');
    }
};

// @desc    Update an existing sale (e.g., add/remove items, change payment method)
// @route   PUT /api/sales/:id
// @access  Private (Store Owner, Admin)
exports.updateSale = async (req, res) => {
    const saleId = parseInt(req.params.id);
    const { total_amount, payment_method, items } = req.body;

    try {
        const existingSale = await db.query(
            'SELECT sale_id FROM Sales WHERE sale_id = $1',
            [saleId]
        );
        if (existingSale.rows.length === 0) {
            return handleError(res, 404, 'Sale not found.');
        }

        await db.pool.query('BEGIN');

        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        if (total_amount !== undefined) { updateFields.push(`total_amount = $${paramIndex++}`); updateValues.push(total_amount); }
        if (payment_method !== undefined) { updateFields.push(`payment_method = $${paramIndex++}`); updateValues.push(payment_method); }

        if (updateFields.length > 0) {
            const updateQuery = `
                UPDATE Sales
                SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE sale_id = $${paramIndex}
                RETURNING sale_id
            `;
            updateValues.push(saleId);
            await db.query(updateQuery, updateValues);
        }

        // Update sale items if provided
        if (Array.isArray(items)) {
            await db.query('DELETE FROM Sale_Items WHERE sale_id = $1', [saleId]);

            for (const item of items) {
                if (!item.product_id || item.quantity === undefined || item.quantity === null || item.unit_price === undefined || item.unit_price === null) {
                    throw new Error('Invalid sale item data provided for update.');
                }
                const productExists = await db.query('SELECT product_id FROM Products WHERE product_id = $1', [item.product_id]);
                if (productExists.rows.length === 0) {
                    throw new Error(`Product with ID ${item.product_id} not found for update.`);
                }

                await db.query(
                    `INSERT INTO Sale_Items (sale_id, product_id, quantity, unit_price)
                     VALUES ($1, $2, $3, $4)`,
                    [saleId, item.product_id, item.quantity, item.unit_price]
                );
            }
        }

        await db.pool.query('COMMIT');

        res.status(200).json({ message: 'Sale updated successfully!' });

    } catch (error) {
        await db.pool.query('ROLLBACK');
        console.error('Error updating sale:', error);
        handleError(res, 500, error.message || 'Server error updating sale.');
    }
};

// @desc    Delete a sale
// @route   DELETE /api/sales/:id
// @access  Private (Store Owner, Admin)
exports.deleteSale = async (req, res) => {
    const saleId = parseInt(req.params.id);

    try {
        const existingSale = await db.query(
            'SELECT sale_id FROM Sales WHERE sale_id = $1',
            [saleId]
        );
        if (existingSale.rows.length === 0) {
            return handleError(res, 404, 'Sale not found.');
        }

        await db.pool.query('BEGIN');
        await db.query('DELETE FROM Sale_Items WHERE sale_id = $1', [saleId]);
        const deleteResult = await db.query(
            'DELETE FROM Sales WHERE sale_id = $1 RETURNING sale_id',
            [saleId]
        );

        if (deleteResult.rows.length === 0) {
            throw new Error('Sale could not be deleted.');
        }
        await db.pool.query('COMMIT');

        res.status(200).json({ message: 'Sale deleted successfully!', saleId: saleId });
    } catch (error) {
        await db.pool.query('ROLLBACK');
        console.error('Error deleting sale:', error);
        handleError(res, 500, 'Server error deleting sale.');
    }
};
