const db = require('../database/db');
const handleError = require("../utils/errorHandler");

exports.getYesterdaysOverStock = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);

        const overStockQuery = `
            SELECT * FROM overstocks
            WHERE created_at >= $1 AND created_at < $2
            ORDER BY created_at DESC
        `;
        
        const queryParams = [yesterday, today];

        const overStockResult = await db.query(overStockQuery, queryParams);
        const overStocks = overStockResult.rows;

        res.status(200).json(overStocks);

    } catch (error) {
        console.error("Error fetching yesterday's overstock:", error);
        handleError(res, 500, "Server error fetching yesterday's overstock.");        
    }
};

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
            await db.query(updateProductQuery, [item.quantity_left, item.product_id]);
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