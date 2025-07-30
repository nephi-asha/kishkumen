const db = require('../database/db');
const handleError = require('../utils/errorHandler');

// @desc    Get all recipes for the authenticated user's bakery
// @route   GET /api/recipes
// @access  Private (Any authenticated user within a bakery)
exports.getAllRecipes = async (req, res) => {
    try {
        const recipes = await db.query(
            `SELECT recipe_id, recipe_name, description, batch_size, created_at, updated_at
             FROM Recipes
             ORDER BY recipe_name`
        );
        res.status(200).json(recipes.rows);
    } catch (error) {
        console.error('Error fetching recipes:', error);
        handleError(res, 500, 'Server error fetching recipes.');
    }
};

// @desc    Get a single recipe by ID, including its ingredients
// @route   GET /api/recipes/:id
// @access  Private (Any authenticated user within a bakery)
exports.getRecipeById = async (req, res) => {
    const recipeId = parseInt(req.params.id);

    try {
        const recipeResult = await db.query(
            `SELECT recipe_id, recipe_name, description, batch_size, created_at, updated_at
             FROM Recipes
             WHERE recipe_id = $1`,
            [recipeId]
        );

        if (recipeResult.rows.length === 0) {
            return handleError(res, 404, 'Recipe not found.');
        }

        const recipe = recipeResult.rows[0];

        // Fetch associated ingredients for this recipe
        const ingredientsResult = await db.query(
            `SELECT ri.quantity, i.ingredient_id, i.ingredient_name, i.unit_of_measure
             FROM Recipe_Ingredients ri
             JOIN Ingredients i ON ri.ingredient_id = i.ingredient_id
             WHERE ri.recipe_id = $1`,
            [recipeId]
        );

        recipe.ingredients = ingredientsResult.rows;
        res.status(200).json(recipe);
    } catch (error) {
        console.error('Error fetching recipe by ID:', error);
        handleError(res, 500, 'Server error fetching recipe.');
    }
};

// @desc    Create a new recipe
// @route   POST /api/recipes
// @access  Private (Store Owner, Admin, Baker)
exports.createRecipe = async (req, res) => {
    const { recipe_name, description, batch_size, ingredients } = req.body; // 'ingredients' is an array of { ingredient_id, quantity }

    if (!recipe_name || !batch_size || !Array.isArray(ingredients) || ingredients.length === 0) {
        return handleError(res, 400, 'Recipe name, batch size, and at least one ingredient are required.');
    }

    try {
        // Check for existing recipe name within the current tenant's schema
        const existingRecipe = await db.query(
            'SELECT recipe_id FROM Recipes WHERE recipe_name = $1',
            [recipe_name]
        );
        if (existingRecipe.rows.length > 0) {
            return handleError(res, 409, 'Recipe with this name already exists in your bakery.');
        }

        await db.pool.query('BEGIN');

        // Insert the new recipe
        const newRecipeResult = await db.query(
            `INSERT INTO Recipes (recipe_name, description, batch_size)
             VALUES ($1, $2, $3) RETURNING recipe_id, recipe_name`,
            [recipe_name, description || null, batch_size]
        );
        const newRecipeId = newRecipeResult.rows[0].recipe_id;

        // Insert recipe ingredients
        for (const item of ingredients) {
            if (!item.ingredient_id || item.quantity === undefined || item.quantity === null) {
                throw new Error('Invalid ingredient data provided.');
            }
            // Verify ingredient_id exists in the current tenant's Ingredients table
            const ingredientExists = await db.query('SELECT ingredient_id FROM Ingredients WHERE ingredient_id = $1', [item.ingredient_id]);
            if (ingredientExists.rows.length === 0) {
                throw new Error(`Ingredient with ID ${item.ingredient_id} not found.`);
            }

            await db.query(
                `INSERT INTO Recipe_Ingredients (recipe_id, ingredient_id, quantity)
                 VALUES ($1, $2, $3)`,
                [newRecipeId, item.ingredient_id, item.quantity]
            );
        }

        await db.pool.query('COMMIT');

        res.status(201).json({
            message: 'Recipe created successfully!',
            recipe: newRecipeResult.rows[0]
        });

    } catch (error) {
        await db.pool.query('ROLLBACK');
        console.error('Error creating recipe:', error);
        handleError(res, 500, error.message || 'Server error creating recipe.');
    }
};

// @desc    Update an existing recipe
// @route   PUT /api/recipes/:id
// @access  Private (Store Owner, Admin, Baker)
exports.updateRecipe = async (req, res) => {
    const recipeId = parseInt(req.params.id);
    const { recipe_name, description, batch_size, ingredients } = req.body; // 'ingredients' is an array of { ingredient_id, quantity }

    try {
        // First, verify the recipe exists within the current tenant's schema
        const existingRecipe = await db.query(
            'SELECT recipe_id FROM Recipes WHERE recipe_id = $1',
            [recipeId]
        );
        if (existingRecipe.rows.length === 0) {
            return handleError(res, 404, 'Recipe not found.');
        }

        await db.pool.query('BEGIN');

        // Update recipe details
        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        if (recipe_name !== undefined) { updateFields.push(`recipe_name = $${paramIndex++}`); updateValues.push(recipe_name); }
        if (description !== undefined) { updateFields.push(`description = $${paramIndex++}`); updateValues.push(description); }
        if (batch_size !== undefined) { updateFields.push(`batch_size = $${paramIndex++}`); updateValues.push(batch_size); }

        if (updateFields.length > 0) {
            const updateQuery = `
                UPDATE Recipes
                SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
                WHERE recipe_id = $${paramIndex}
                RETURNING recipe_id, recipe_name
            `;
            updateValues.push(recipeId);
            await db.query(updateQuery, updateValues);
        }

        // Update recipe ingredients if provided
        if (Array.isArray(ingredients)) {
            // Delete existing ingredients for this recipe
            await db.query('DELETE FROM Recipe_Ingredients WHERE recipe_id = $1', [recipeId]);

            // Insert new/updated ingredients
            for (const item of ingredients) {
                if (!item.ingredient_id || item.quantity === undefined || item.quantity === null) {
                    throw new Error('Invalid ingredient data provided for update.');
                }
                // Verify ingredient_id exists in the current tenant's Ingredients table
                const ingredientExists = await db.query('SELECT ingredient_id FROM Ingredients WHERE ingredient_id = $1', [item.ingredient_id]);
                if (ingredientExists.rows.length === 0) {
                    throw new Error(`Ingredient with ID ${item.ingredient_id} not found for update.`);
                }

                await db.query(
                    `INSERT INTO Recipe_Ingredients (recipe_id, ingredient_id, quantity)
                     VALUES ($1, $2, $3)`,
                    [recipeId, item.ingredient_id, item.quantity]
                );
            }
        }

        await db.pool.query('COMMIT');

        res.status(200).json({ message: 'Recipe updated successfully!' });

    } catch (error) {
        await db.pool.query('ROLLBACK');
        console.error('Error updating recipe:', error);
        handleError(res, 500, error.message || 'Server error updating recipe.');
    }
};

// @desc    Delete a recipe
// @route   DELETE /api/recipes/:id
// @access  Private (Store Owner, Admin)
exports.deleteRecipe = async (req, res) => {
    const recipeId = parseInt(req.params.id);

    try {
        // Verify the recipe exists within the current tenant's schema
        const existingRecipe = await db.query(
            'SELECT recipe_id FROM Recipes WHERE recipe_id = $1',
            [recipeId]
        );
        if (existingRecipe.rows.length === 0) {
            return handleError(res, 404, 'Recipe not found.');
        }

        await db.pool.query('BEGIN');
        // Delete associated recipe ingredients first (CASCADE on FK would also handle this)
        await db.query('DELETE FROM Recipe_Ingredients WHERE recipe_id = $1', [recipeId]);
        // Then delete the recipe itself
        const deleteResult = await db.query(
            'DELETE FROM Recipes WHERE recipe_id = $1 RETURNING recipe_id',
            [recipeId]
        );

        if (deleteResult.rows.length === 0) {
            throw new Error('Recipe could not be deleted.'); // Should not happen if existingRecipe check passed
        }
        await db.pool.query('COMMIT');

        res.status(200).json({ message: 'Recipe deleted successfully!', recipeId: recipeId });
    } catch (error) {
        await db.pool.query('ROLLBACK');
        console.error('Error deleting recipe:', error);
        handleError(res, 500, 'Server error deleting recipe.');
    }
};
