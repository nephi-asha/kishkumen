const db = require('../database/db');
const handleError = require("../utils/errorHandler");



// defects: defect_id, product_id, defect_count, created_at
exports.createDefects = async (req, res) => {
    const productId = parseInt(req.params.id);
    const { defectCount } = req.body;

    if (defectCount == undefined || defectCount < 0) {
        return handleError(res, 400, "invalid defect count.")
    }
    try {
        await db.query(
            `INSERT INTO defects (product_id, defect_count)
            VALUES ($1, $2)`,
            [productId, defectCount || 0]
        );
        await db.query(
            `UPDATE Products
            SET defect_count = defect_count + $1, updated_at = CURRENT_TIMESTAMP
            WHERE product_id = $2`,
            [defectCount, productId]
        );
        await db.query(
            `UPDATE Products
            SET quantity_left = quantity_left - $1, updated_at = CURRENT_TIMESTAMP
            WHERE product_id = $2`,
            [defectCount, productId]
        );
        let message = `${defectCount} defects recorded successfully`
        res.status(200).json(message)

    } catch (error) {
        console.error('Error updating product defect count:', error);
        handleError(res, 500, 'Server error updating product defect count.');
    }
    
}

exports.getAllDefects = async (req, res) => {
    const {startDate, endDate } = req.query;

    let defectQuery = `
    SELECT * FROM defects
    `;
    let defectsQueryParams = [];
    let paramIndex = 1;

    if (startDate || endDate) {
        defectQuery += ` WHERE `;
        if (startDate) {
            defectQuery += `created_at >= $${paramIndex++}`;
            defectsQueryParams.push(startDate);
        }
        if (startDate && endDate) {
            defectQuery += ` AND `;
        }
        if (endDate) {
            const adjustedEndDate = new Date(endDate);
            adjustedEndDate.setDate(adjustedEndDate.getDate() + 1);

            defectQuery += `created_at < $${paramIndex++}`;
            defectsQueryParams.push(adjustedEndDate.toISOString().split('T')[0]);
        }
    }
    defectQuery += ` ORDER BY created_at DESC`;

    try {
        const defectsResult = await db.query(defectQuery, defectsQueryParams);
        const defects = defectsResult.rows;
        res.status(200).json(defects)
        }
    catch (error) {
        console.error('Error fetching defects:', error);
        handleError(res, 500, 'Server error fetching defects.');        
    }
}

exports.getDefectById = async (req, res) => {
    const defectId = parseInt(req.params.id);
    try {

        const defectResult  = await db.query(
            `
            SELECT * FROM defects 
            WHERE defect_id = $1`,
            [defectId]
        );
        res.status(200).json(defectResult.rows[0])
    } catch (error) {
        console.error('Error fetching defect by ID: ', error);
        handleError(res, 500, 'Server error fetching defect.')
    }

}