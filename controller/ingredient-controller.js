const db = require('../database/db');
const handleError = require('../utils/errorHandler');

// @desc    Get all ingredients for the authenticated user's bakery
// @route   GET /api/ingredients
// @access  Private (Any authenticated user within a bakery)
exports.getAllIngredients = async (req, res) => {
    try {
        const ingredients = await db.query(
            `SELECT ingredient_id, ingredient_name, unit_of_measure, current_stock, reorder_level, refill_amount, supplier, cost_price, created_at, updated_at
             FROM Ingredients
             ORDER BY ingredient_name`
        );
        res.status(200).json(ingredients.rows);
    } catch (error) {
        console.error('Error fetching ingredients:', error);
        handleError(res, 500, 'Server error fetching ingredients.');
    }
};

// @desc    Get a single ingredient by ID for the authenticated user's bakery
// @route   GET /api/ingredients/:id
// @access  Private (Any authenticated user within a bakery)
exports.getIngredientById = async (req, res) => {
    const ingredientId = parseInt(req.params.id);

    try {
        const ingredient = await db.query(
            `SELECT ingredient_id, ingredient_name, unit_of_measure, current_stock, reorder_level, refill_amount, supplier, cost_price, created_at, updated_at
             FROM Ingredients
             WHERE ingredient_id = $1`,
            [ingredientId]
        );

        if (ingredient.rows.length === 0) {
            return handleError(res, 404, 'Ingredient not found or not accessible to your bakery.');
        }
        res.status(200).json(ingredient.rows[0]);
    } catch (error) {
        console.error('Error fetching ingredient by ID:', error);
        handleError(res, 500, 'Server error fetching ingredient.');
    }
};

// @desc    Create a new ingredient for the authenticated user's bakery
// @route   POST /api/ingredients
// @access  Private (Store Owner, Admin, Baker)
exports.createIngredient = async (req, res) => {
    const { ingredient_name, unit_of_measure, current_stock, reorder_level, refill_amount, supplier, cost_price } = req.body;

    // Basic validation
    if (!ingredient_name || !unit_of_measure) {
        return handleError(res, 400, 'Ingredient name and unit of measure are required.');
    }

    try {
        // Check for existing ingredient name within the current tenant's schema
        const existingIngredient = await db.query(
            'SELECT ingredient_id FROM Ingredients WHERE ingredient_name = $1',
            [ingredient_name]
        );
        if (existingIngredient.rows.length > 0) {
            return handleError(res, 409, 'Ingredient with this name already exists in your bakery.');
        }

        const newIngredient = await db.query(
            `INSERT INTO Ingredients (ingredient_name, unit_of_measure, current_stock, reorder_level, refill_amount, supplier, cost_price)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING ingredient_id, ingredient_name, cost_price`,
            [ingredient_name, unit_of_measure, current_stock || 0, reorder_level || 0, refill_amount || 0, supplier || null, cost_price || 0.00]
        );
        res.status(201).json({
            message: 'Ingredient created successfully!',
            ingredient: newIngredient.rows[0]
        });
    } catch (error) {
        console.error('Error creating ingredient:', error);
        handleError(res, 500, 'Server error creating ingredient.');
    }
};

// @desc    Update an existing ingredient for the authenticated user's bakery
// @route   PUT /api/ingredients/:id
// @access  Private (Store Owner, Admin, Baker)
exports.updateIngredient = async (req, res) => {
    const ingredientId = parseInt(req.params.id);
    const { ingredient_name, unit_of_measure, current_stock, reorder_level, refill_amount, supplier, cost_price } = req.body;

    try {
        // Verify the ingredient exists within the current tenant's schema
        const existingIngredient = await db.query(
            'SELECT ingredient_id FROM Ingredients WHERE ingredient_id = $1',
            [ingredientId]
        );
        if (existingIngredient.rows.length === 0) {
            return handleError(res, 404, 'Ingredient not found or not accessible to your bakery.');
        }

        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        if (ingredient_name !== undefined) { updateFields.push(`ingredient_name = $${paramIndex++}`); updateValues.push(ingredient_name); }
        if (unit_of_measure !== undefined) { updateFields.push(`unit_of_measure = $${paramIndex++}`); updateValues.push(unit_of_measure); }
        if (current_stock !== undefined) { updateFields.push(`current_stock = $${paramIndex++}`); updateValues.push(current_stock); }
        if (reorder_level !== undefined) { updateFields.push(`reorder_level = $${paramIndex++}`); updateValues.push(reorder_level); }
        if (refill_amount !== undefined) { updateFields.push(`refill_amount = $${paramIndex++}`); updateValues.push(refill_amount); }
        if (supplier !== undefined) { updateFields.push(`supplier = $${paramIndex++}`); updateValues.push(supplier); }
        if (cost_price !== undefined) { updateFields.push(`cost_price = $${paramIndex++}`); updateValues.push(cost_price); }


        if (updateFields.length === 0) {
            return handleError(res, 400, 'No fields provided for update.');
        }

        updateValues.push(ingredientId); // Add ingredientId for WHERE clause
        const updateQuery = `
            UPDATE Ingredients
            SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE ingredient_id = $${paramIndex}
            RETURNING ingredient_id, ingredient_name, cost_price
        `;

        const updatedIngredient = await db.query(updateQuery, updateValues);

        res.status(200).json({
            message: 'Ingredient updated successfully!',
            ingredient: updatedIngredient.rows[0]
        });
    } catch (error) {
        console.error('Error updating ingredient:', error);
        handleError(res, 500, 'Server error updating ingredient.');
    }
};

// @desc    Delete an ingredient for the authenticated user's bakery
// @route   DELETE /api/ingredients/:id
// @access  Private (Store Owner, Admin)
exports.deleteIngredient = async (req, res) => {
    const ingredientId = parseInt(req.params.id);

    try {
        // Verify the ingredient belongs to the current tenant's schema
        const existingIngredient = await db.query(
            'SELECT ingredient_id FROM Ingredients WHERE ingredient_id = $1',
            [ingredientId]
        );
        if (existingIngredient.rows.length === 0) {
            return handleError(res, 404, 'Ingredient not found or not accessible to your bakery.');
        }

        const deleteResult = await db.query(
            'DELETE FROM Ingredients WHERE ingredient_id = $1 RETURNING ingredient_id',
            [ingredientId]
        );

        if (deleteResult.rows.length === 0) {
            return handleError(res, 404, 'Ingredient not found or could not be deleted.');
        }

        res.status(200).json({ message: 'Ingredient deleted successfully!', ingredientId: ingredientId });
    } catch (error) {
        console.error('Error deleting ingredient:', error);
        // Check for specific foreign key violation error (PostgreSQL code '23503')
        if (error.code === '23503') {
            // Extract the table name from the error detail if available
            const detail = error.detail || '';
            let referencingTable = 'another table'; // Default message
            const match = detail.match(/from table "(\w+)"/);
            if (match && match[1]) {
                referencingTable = match[1];
            }
            return handleError(res, 409, `Cannot delete ingredient: It is currently used in the '${referencingTable}' table. Please remove it from there first.`);
        }
        handleError(res, 500, 'Server error deleting ingredient.');
    }
};

exports.refillIngredientStock = async (req, res) => {
    const ingredient_id = parseInt(req.params.id);
    const { refill_amount } = req.query;

    if(refill_amount <= 0) {
        return handleError(res, 400, 'Invalid refill amount.');
    }

    try {
        await db.query(
            `UPDATE Ingredients 
            SET 
            current_stock = current_stock + refill_amount,
            refill_amount = 0,
            updated_at = CURRENT_TIMESTAMP 
            WHERE ingredient_id = $1`,
            [ingredient_id]
        );
        res.status(200).json({ message: 'Ingredient stock refilled successfully!' });
    } catch (error) {
        console.error('Error refilling ingredient stock:', error);
        handleError(res, 500, 'Server error refilling ingredient stock.');
    }
};
