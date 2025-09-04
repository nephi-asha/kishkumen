const db = require('../database/db');
const handleError = require('../utils/errorHandler');

exports.createRestockRequest = async (req, res) => {
    const { product_id, restock_value } = req.body;

    if (!product_id || !restock_value) {
        return handleError(res, 400, 'Product ID and refill amount are required.');
    }

    try {
        const newRestockRequest = await db.query(
            `INSERT INTO restocks (product_id, restock_value, created_at)
             VALUES ($1, $2, CURRENT_TIMESTAMP) RETURNING *`,
            [product_id, restock_value]
        );
        res.status(201).json({
            message: 'Restock request created successfully!',
            restockRequest: newRestockRequest.rows[0]
        });
    } catch (error) {
        console.error('Error creating restock request:', error);
        handleError(res, 500, 'Server error creating restock request.');
    }
};


exports.getAllRestockRequests = async (req, res) => {
    const { startDate, endDate } = req.query;
    const restockQueryParams  = [];
    let paramIndex = 1;
    let restockQuery = `SELECT * FROM restocks`;

    if (startDate || endDate) {
        restockQuery += ` WHERE`;
        if (startDate) {
            restockQuery += ` created_at >= $${paramIndex++}`;
            restockQueryParams.push(startDate);
        }
        if (startDate && endDate) {
            restockQuery += ` AND `;
        }
        if (endDate) {
            const adjustedEndDate = new Date(endDate);
            adjustedEndDate.setDate(adjustedEndDate.getDate() + 1);

            restockQuery += ` created_at <= $${paramIndex++}`;
            restockQueryParams.push(adjustedEndDate.toISOString().split('T')[0]);
        }
        restockQuery += ` ORDER BY created_at DESC`;
    }

    try {
        const restockResult = await db.query(restockQuery, restockQueryParams);
        const restocks = restockResult.rows;

        for (let i =0; i < restocks.length; i++) {
            const restock = restocks[i];
            const restockItemsResult = await db.query(
                `
                SELECT ri.restock_id, ri.product_id, pr.product_name, pr.cost_price, COALESCE(ri.restock_value, 0) AS restock_value, ri.created_at
                FROM restocks ri
                JOIN products pr ON ri.product_id = pr.product_id
                WHERE ri.restock_id = $1
                `,
                [restock.restock_id]
            );
            restock.items = restockItemsResult.rows;
        }
        res.status(200).json(restocks[0].items);
    } catch (error) {
        console.error('Error fetching restock requests:', error);
        handleError(res, 500, 'Server error fetching restock requests.');
    }
};
