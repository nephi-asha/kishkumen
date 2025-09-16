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