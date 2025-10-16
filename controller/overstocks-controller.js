const db = require('../database/db');
const handleError = require("../utils/errorHandler");

exports.getOverStockData = async (req, res) => {
    const {startDate, endDate } = req.query;

    let overStockQuery = `
    SELECT * FROM overstocks
    `;
    let overStockQueryParams = [];
    let paramIndex = 1;

    if (startDate || endDate) {
        overStockQuery += ` WHERE `;
        if (startDate) {
            overStockQuery += `created_at >= $${paramIndex++}`;
            overStockQueryParams.push(startDate);
        }
        if (startDate && endDate) {
            overStockQuery += ` AND `;
        }
        if (endDate) {
            const adjustedEndDate = new Date(endDate);
            adjustedEndDate.setDate(adjustedEndDate.getDate() + 1);

            overStockQuery += `created_at < $${paramIndex++}`;
            overStockQueryParams.push(adjustedEndDate.toISOString().split('T')[0]);
        }
    }
    overStockQuery += ` ORDER BY created_at DESC`;

    try {
        const overStockResult = await db.query(overStockQuery, overStockQueryParams);
        const overStocks = overStockResult.rows;
        res.status(200).json(overStocks)
        }
    catch (error) {
        console.error('Error fetching defects:', error);
        handleError(res, 500, 'Server error fetching defects.');        
    }
}

exports.rollOverStock = async (req, res) => {

    try {
        await db.query('BEGIN'); 

        const getOverstockQuery = `
            SELECT product_id, quantity_left
            FROM overstocks
            WHERE rolled_over = False;
        `;
        const overstockResult = await db.query(getOverstockQuery);
        const overstocks = overstockResult.rows;

        if (overstocks.length === 0) {
            await db.query('COMMIT');
            return res.status(200).json({ message: 'No overstock to roll over.' });
        }

        for (const item of overstocks) {
            const updateProductQuery = `
                UPDATE products
                SET quantity_left = quantity_left + $1
                WHERE product_id = $2;
            `;
            await db.query(updateProductQuery, [item.quantity, item.product_id]);
        }

        const clearOverstockQuery = `
            UPDATE overstocks SET rolled_over = TRUE;
        `;
        await db.query(clearOverstockQuery);

        await db.query('COMMIT');
        res.status(200).json({ message: `Successfully rolled over ${overstocks.length} overstock entries.` });

    } catch (error) {
        await db.query('ROLLBACK');
        console.error('Error rolling over stock:', error);
        handleError(res, 500, 'Server error during stock roll over.');
    }
};