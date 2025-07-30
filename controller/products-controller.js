const db = require('../database/db');
const handleError = require('../utils/errorHandler');

// @desc    Get all products for the authenticated user's bakery
// @route   GET /api/products
// @access  Private (Any authenticated user within a bakery)
exports.getAllProducts = async (req, res) => {
    // No tenantId check here, as setTenantSchema middleware handles search_path
    try {
        const products = await db.query(
            `SELECT product_id, product_name, description, unit_price, is_active, created_at, updated_at
             FROM Products
             ORDER BY product_name`
        );
        res.status(200).json(products.rows);
    } catch (error) {
        console.error('Error fetching products:', error);
        handleError(res, 500, 'Server error fetching products.');
    }
};

// @desc    Get a single product by ID for the authenticated user's bakery
// @route   GET /api/products/:id
// @access  Private (Any authenticated user within a bakery)
exports.getProductById = async (req, res) => {
    const productId = parseInt(req.params.id);
    // No tenantId check here, as setTenantSchema middleware handles search_path

    try {
        const product = await db.query(
            `SELECT product_id, product_name, description, unit_price, is_active, created_at, updated_at
             FROM Products
             WHERE product_id = $1`, // Query implicitly uses the tenant's schema
            [productId]
        );

        if (product.rows.length === 0) {
            return handleError(res, 404, 'Product not found or not accessible to your bakery.');
        }
        res.status(200).json(product.rows[0]);
    } catch (error) {
        console.error('Error fetching product by ID:', error);
        handleError(res, 500, 'Server error fetching product.');
    }
};

// @desc    Create a new product for the authenticated user's bakery
// @route   POST /api/products
// @access  Private (Store Owner, Admin)
exports.createProduct = async (req, res) => {
    const { product_name, description, unit_price, is_active } = req.body;
    // No tenantId check here, as setTenantSchema middleware handles search_path

    // --- START OF RELEVANT VALIDATION ---
    if (!product_name || unit_price === undefined || unit_price === null) {
        return handleError(res, 400, 'Name and price are required');
    }
    // --- END OF RELEVANT VALIDATION ---

    try {
        // Check for existing product name within the current tenant's schema
        const existingProduct = await db.query(
            'SELECT product_id FROM Products WHERE product_name = $1',
            [product_name]
        );
        if (existingProduct.rows.length > 0) {
            return handleError(res, 409, 'Product with this name already exists in your bakery.');
        }

        const newProduct = await db.query(
            `INSERT INTO Products (product_name, description, unit_price, is_active)
             VALUES ($1, $2, $3, $4) RETURNING product_id, product_name`,
            [product_name, description, unit_price, is_active !== undefined ? is_active : true]
        );
        res.status(201).json({
            message: 'Product created successfully!',
            product: newProduct.rows[0]
        });
    } catch (error) {
        console.error('Error creating product:', error);
        handleError(res, 500, 'Server error creating product.');
    }
};

// @desc    Update an existing product for the authenticated user's bakery
// @route   PUT /api/products/:id
// @access  Private (Store Owner, Admin)
exports.updateProduct = async (req, res) => {
    const productId = parseInt(req.params.id);
    const { product_name, description, unit_price, is_active } = req.body;
    // No tenantId check here, as setTenantSchema middleware handles search_path

    try {
        // Verify the product exists within the current tenant's schema
        const existingProduct = await db.query(
            'SELECT product_id FROM Products WHERE product_id = $1',
            [productId]
        );
        if (existingProduct.rows.length === 0) {
            return handleError(res, 404, 'Product not found or not accessible to your bakery.');
        }

        const updateFields = [];
        const updateValues = [];
        let paramIndex = 1;

        if (product_name !== undefined) { updateFields.push(`product_name = $${paramIndex++}`); updateValues.push(product_name); }
        if (description !== undefined) { updateFields.push(`description = $${paramIndex++}`); updateValues.push(description); }
        if (unit_price !== undefined) { updateFields.push(`unit_price = $${paramIndex++}`); updateValues.push(unit_price); }
        if (is_active !== undefined) { updateFields.push(`is_active = $${paramIndex++}`); updateValues.push(is_active); }

        if (updateFields.length === 0) {
            return handleError(res, 400, 'No fields provided for update.');
        }

        updateValues.push(productId); // Add productId for WHERE clause
        const updateQuery = `
            UPDATE Products
            SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
            WHERE product_id = $${paramIndex}
            RETURNING product_id, product_name
        `;

        const updatedProduct = await db.query(updateQuery, updateValues);

        res.status(200).json({
            message: 'Product updated successfully!',
            product: updatedProduct.rows[0]
        });
    } catch (error) {
        console.error('Error updating product:', error);
        handleError(res, 500, 'Server error updating product.');
    }
};

// @desc    Delete a product for the authenticated user's bakery
// @route   DELETE /api/products/:id
// @access  Private (Store Owner, Admin)
exports.deleteProduct = async (req, res) => {
    const productId = parseInt(req.params.id);
    // No tenantId check here, as setTenantSchema middleware handles search_path

    try {
        // Verify the product belongs to the current tenant's schema
        const existingProduct = await db.query(
            'SELECT product_id FROM Products WHERE product_id = $1',
            [productId]
        );
        if (existingProduct.rows.length === 0) {
            return handleError(res, 404, 'Product not found or not accessible to your bakery.');
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
