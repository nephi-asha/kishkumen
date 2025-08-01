const db = require('../database/db');
const handleError = require('../utils/errorHandler');

// Helper function to calculate recipe cost
async function calculateRecipeCost(recipeId) {
    console.log(`[DEBUG] calculateRecipeCost called for recipeId: ${recipeId}`);
    try {
        const ingredientsCostResult = await db.query(
            `SELECT ri.quantity, i.cost_price
             FROM Recipe_Ingredients ri
             JOIN Ingredients i ON ri.ingredient_id = i.ingredient_id
             WHERE ri.recipe_id = $1`,
            [recipeId]
        );

        console.log(`[DEBUG] Ingredients fetched for recipe ${recipeId}:`, ingredientsCostResult.rows);

        let totalCost = 0;
        for (const item of ingredientsCostResult.rows) {
            // Ensure cost_price is treated as a number
            const ingredientCost = parseFloat(item.cost_price || 0);
            console.log(`[DEBUG] Item: quantity=${item.quantity}, cost_price=${item.cost_price}, parsed_cost=${ingredientCost}`);
            totalCost += item.quantity * ingredientCost;
        }
        console.log(`[DEBUG] Calculated totalCost for recipe ${recipeId}: ${totalCost}`);
        return totalCost;
    } catch (error) {
        console.error('Error calculating recipe cost:', error);
        throw new Error('Failed to calculate recipe cost.');
    }
}

// @desc    Get all products for the authenticated user's bakery
// @route   GET /api/products
// @access  Private (Any authenticated user within a bakery)
exports.getAllProducts = async (req, res) => {
    try {
        const products = await db.query(
            `SELECT product_id, product_name, description, unit_price, cost_price, is_active, recipe_id, created_at, updated_at
             FROM Products
             ORDER BY product_name`
        );
        res.status(200).json(products.rows);
    } catch (error) {
        console.error('Error fetching products:', error);
        handleError(res, 500, 'Server error fetching products.');
    }
};

// @desc    Get a single product by ID
// @route   GET /api/products/:id
// @access  Private (Any authenticated user within a bakery)
exports.getProductById = async (req, res) => {
    const productId = parseInt(req.params.id);

    try {
        const product = await db.query(
            `SELECT product_id, product_name, description, unit_price, cost_price, is_active, recipe_id, created_at, updated_at
             FROM Products
             WHERE product_id = $1`,
            [productId]
        );

        if (product.rows.length === 0) {
            return handleError(res, 404, 'Product not found.');
        }
        res.status(200).json(product.rows[0]);
    } catch (error) {
        console.error('Error fetching product by ID:', error);
        handleError(res, 500, 'Server error fetching product.');
    }
};

// @desc    Create a new product
// @route   POST /api/products
// @access  Private (Store Owner, Admin)
exports.createProduct = async (req, res) => {
    const { product_name, description, unit_price, is_active, recipe_id } = req.body;
    let calculated_cost_price = 0.00;

    if (!product_name || unit_price === undefined || unit_price === null) {
        return handleError(res, 400, 'Product name and unit price are required.');
    }

    try {
        const existingProduct = await db.query(
            'SELECT product_id FROM Products WHERE product_name = $1',
            [product_name]
        );
        if (existingProduct.rows.length > 0) {
            return handleError(res, 409, 'Product with this name already exists in your bakery.');
        }

        if (recipe_id) {
            const recipeExists = await db.query('SELECT recipe_id FROM Recipes WHERE recipe_id = $1', [recipe_id]);
            if (recipeExists.rows.length === 0) {
                return handleError(res, 400, 'Provided recipe_id does not exist.');
            }
            calculated_cost_price = await calculateRecipeCost(recipe_id);
            console.log(`[DEBUG] createProduct: Calculated cost for new product: ${calculated_cost_price}`);
        }

        const newProduct = await db.query(
            `INSERT INTO Products (product_name, description, unit_price, cost_price, is_active, recipe_id)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING product_id, product_name, cost_price`,
            [product_name, description || null, unit_price, calculated_cost_price, is_active !== undefined ? is_active : true, recipe_id || null]
        );
        res.status(201).json({
            message: 'Product created successfully!',
            product: newProduct.rows[0]
        });
    } catch (error) {
        console.error('Error creating product:', error);
        handleError(res, 500, error.message || 'Server error creating product.');
    }
};

// @desc    Update an existing product
// @route   PUT /api/products/:id
// @access  Private (Store Owner, Admin)
exports.updateProduct = async (req, res) => {
    const productId = parseInt(req.params.id);
    const { product_name, description, unit_price, is_active, recipe_id } = req.body;

    try {
        const existingProduct = await db.query(
            'SELECT product_id, recipe_id FROM Products WHERE product_id = $1',
            [productId]
        );
        if (existingProduct.rows.length === 0) {
            return handleError(res, 404, 'Product not found.');
        }

        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;
        let recalculateCost = false;

        if (product_name !== undefined) { updateFields.push(`product_name = $${paramIndex++}`); updateValues.push(product_name); }
        if (description !== undefined) { updateFields.push(`description = $${paramIndex++}`); updateValues.push(description); }
        if (unit_price !== undefined) { updateFields.push(`unit_price = $${paramIndex++}`); updateValues.push(unit_price); }
        if (is_active !== undefined) { updateFields.push(`is_active = $${paramIndex++}`); updateValues.push(is_active); }

        // If recipe_id is explicitly provided or changed, recalculate cost
        if (recipe_id !== undefined && recipe_id !== existingProduct.rows[0].recipe_id) {
            const recipeExists = await db.query('SELECT recipe_id FROM Recipes WHERE recipe_id = $1', [recipe_id]);
            if (recipeExists.rows.length === 0) {
                return handleError(res, 400, 'Provided recipe_id does not exist.');
            }
            updateFields.push(`recipe_id = $${paramIndex++}`);
            updateValues.push(recipe_id);
            recalculateCost = true;
        } else if (recipe_id === null && existingProduct.rows[0].recipe_id !== null) { // If recipe_id is explicitly set to null
            updateFields.push(`recipe_id = $${paramIndex++}`);
            updateValues.push(null);
            updateFields.push(`cost_price = $${paramIndex++}`); // Reset cost_price if recipe is removed
            updateValues.push(0.00);
        } else if (recipe_id === undefined && existingProduct.rows[0].recipe_id !== null) {
            // If recipe_id is NOT provided in the update, but the product already HAS a recipe_id,
            // we should still recalculate if the underlying ingredient costs or recipe quantities might have changed.
            // This is a proactive recalculation.
            recalculateCost = true;
            // Use the existing recipe_id for recalculation
            req.body.recipe_id_for_recalc = existingProduct.rows[0].recipe_id;
        }


        if (recalculateCost) {
            const recipeIdToUse = recipe_id !== undefined ? recipe_id : req.body.recipe_id_for_recalc;
            if (recipeIdToUse) { // Only calculate if there's a recipe to use
                const newCostPrice = await calculateRecipeCost(recipeIdToUse);
                updateFields.push(`cost_price = $${paramIndex++}`);
                updateValues.push(newCostPrice);
                console.log(`[DEBUG] updateProduct: Recalculated cost for product ${productId}: ${newCostPrice}`);
            }
        }

        if (updateFields.length === 0) {
            return handleError(res, 400, 'No fields provided for update.');
        }

        updateValues.push(productId); // Add productId for WHERE clause
        const updateQuery = `
            UPDATE Products
            SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE product_id = $${paramIndex}
            RETURNING product_id, product_name, cost_price
        `;

        const updatedProduct = await db.query(updateQuery, updateValues);

        res.status(200).json({
            message: 'Product updated successfully!',
            product: updatedProduct.rows[0]
        });
    } catch (error) {
        console.error('Error updating product:', error);
        handleError(res, 500, error.message || 'Server error updating product.');
    }
};

// @desc    Delete a product
// @route   DELETE /api/products/:id
// @access  Private (Store Owner, Admin)
exports.deleteProduct = async (req, res) => {
    const productId = parseInt(req.params.id);

    try {
        const existingProduct = await db.query(
            'SELECT product_id FROM Products WHERE product_id = $1',
            [productId]
        );
        if (existingProduct.rows.length === 0) {
            return handleError(res, 404, 'Product not found.');
        }

        const deleteResult = await db.query(
            'DELETE FROM Products WHERE product_id = $1 RETURNING product_id',
            [productId]
        );

        if (deleteResult.rows.length === 0) {
            return handleError(res, 404, 'Product not found or could not be deleted.');
        }

        res.status(200).json({ message: 'Product deleted successfully!', productId: productId });
    } catch (error) {
        console.error('Error deleting product:', error);
        handleError(res, 500, 'Server error deleting product.');
    }
};
