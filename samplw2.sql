-- =================================================================
-- PART 1: PUBLIC SCHEMA
-- These tables manage the tenants (bakeries), users, and roles.
-- They are shared across the entire application.
-- =================================================================

BEGIN;

-- Drop tables in reverse order of dependency to avoid foreign key errors
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.tenants CASCADE;
DROP TABLE IF EXISTS public.roles CASCADE;

-- ROLES TABLE
-- Defines the roles available in the system (e.g., Admin, Baker).
CREATE TABLE public.roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TENANTS TABLE
-- Each row represents a separate bakery business with its own schema.
CREATE TABLE public.tenants (
    tenant_id SERIAL PRIMARY KEY,
    business_name VARCHAR(100) UNIQUE NOT NULL,
    schema_name VARCHAR(100) UNIQUE NOT NULL,
    owner_user_id INT, -- Forward reference, will be constrained later
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- USERS TABLE
-- Stores user accounts. Each user is linked to a specific tenant.
CREATE TABLE public.users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    approval_token TEXT,
    tenant_id INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_users_tenant
        FOREIGN KEY (tenant_id) REFERENCES public.tenants(tenant_id) ON DELETE SET NULL
);

-- Now, add the foreign key from tenants to users now that the users table exists.
ALTER TABLE public.tenants
ADD CONSTRAINT fk_tenants_owner_user
FOREIGN KEY (owner_user_id) REFERENCES public.users(user_id) ON DELETE SET NULL;

-- USER_ROLES JUNCTION TABLE
-- Links users to their roles (many-to-many relationship).
CREATE TABLE public.user_roles (
    user_role_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    role_id INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, role_id),
    CONSTRAINT fk_user_roles_user
        FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_user_roles_role
        FOREIGN KEY (role_id) REFERENCES public.roles(role_id) ON DELETE CASCADE
);

-- Insert the default roles into the public schema.
INSERT INTO public.roles (role_name) VALUES
('Store Owner'),
('Admin'),
('Baker'),
('Cashier'),
('Super Admin')
ON CONFLICT (role_name) DO NOTHING;


-- Create indexes for performance on frequently queried columns
CREATE INDEX idx_users_tenant_id ON public.users(tenant_id);
CREATE INDEX idx_tenants_owner_user_id ON public.tenants(owner_user_id);


COMMIT;


-- =================================================================
-- PART 2: TENANT SCHEMA TEMPLATE
-- This block of code should be executed by your application for each
-- new tenant to create their isolated set of tables.
-- The placeholder '$schema_name' should be replaced with the actual
-- schema name (e.g., 'bakery_johns_bakery_1668532').
-- =================================================================

-- NOTE: This part is for your application logic to use. Do not run it directly
-- without replacing '$schema_name'. The Java application will be responsible
-- for creating a new schema and then running these commands within it.


-- CREATE SCHEMA IF NOT EXISTS $schema_name;
-- SET search_path TO $schema_name, public;

-- INGREDIENTS TABLE
CREATE TABLE ingredients (
    ingredient_id SERIAL PRIMARY KEY,
    ingredient_name VARCHAR(100) NOT NULL UNIQUE,
    unit_of_measure VARCHAR(50),
    current_stock NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    reorder_level NUMERIC(10, 2),
    refill_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    supplier VARCHAR(100),
    cost_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RECIPES TABLE
CREATE TABLE recipes (
    recipe_id SERIAL PRIMARY KEY,
    recipe_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    batch_size VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RECIPE_INGREDIENTS JUNCTION TABLE
CREATE TABLE recipe_ingredients (
    recipe_ingredient_id SERIAL PRIMARY KEY,
    recipe_id INT NOT NULL,
    ingredient_id INT NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL,
    -- If a recipe is deleted, its ingredient links are also deleted.
    CONSTRAINT fk_recipe
        FOREIGN KEY (recipe_id) REFERENCES recipes(recipe_id) ON DELETE CASCADE,
    -- An ingredient cannot be deleted if it is used in a recipe.
    CONSTRAINT fk_ingredient
        FOREIGN KEY (ingredient_id) REFERENCES ingredients(ingredient_id) ON DELETE RESTRICT
);

-- PRODUCTS TABLE
CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    product_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    unit_price NUMERIC(10, 2) NOT NULL,
    cost_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN NOT NULL DEFAULT TRUE, -- For "soft deletes"
    recipe_id INT,
    quantity_left INT NOT NULL DEFAULT 0,
    defect_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- If a recipe is deleted, the product's link to it is just removed (set to NULL).
    CONSTRAINT fk_products_recipe
        FOREIGN KEY (recipe_id) REFERENCES recipes(recipe_id) ON DELETE SET NULL
);

-- SALES TABLE
CREATE TABLE sales (
    sale_id SERIAL PRIMARY KEY,
    sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_amount NUMERIC(10, 2) NOT NULL,
    payment_method VARCHAR(50),
    cashier_user_id INT, -- This is a public user, so no direct FK constraint here.
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SALE_ITEMS TABLE
CREATE TABLE sale_items (
    sale_item_id SERIAL PRIMARY KEY,
    sale_id INT NOT NULL,
    product_id INT NOT NULL,
    quantity INT NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,
    -- If a sale is deleted, all its items are deleted with it.
    CONSTRAINT fk_sale_items_sale
        FOREIGN KEY (sale_id) REFERENCES sales(sale_id) ON DELETE CASCADE,
    -- A product CANNOT be hard-deleted if it has been sold. Use soft-delete (is_active=false) on the product instead.
    CONSTRAINT fk_sale_items_product
        FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE RESTRICT
);

-- DEFECTS TABLE
CREATE TABLE defects (
    defect_id SERIAL PRIMARY KEY,
    product_id INT NOT NULL,
    defect_count INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- A product cannot be hard-deleted if it has defect records.
    CONSTRAINT fk_defects_product
        FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE RESTRICT
);

-- EXPENSES TABLE
CREATE TABLE expenses (
    expense_id SERIAL PRIMARY KEY,
    expense_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    amount NUMERIC(10, 2) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    cost_type VARCHAR(20) NOT NULL CHECK (cost_type IN ('Fixed', 'Variable')),
    frequency VARCHAR(50) DEFAULT 'One-time' CHECK (frequency IN ('One-time', 'Monthly', 'Yearly')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add more tenant-specific tables like 'overstocks', 'restocks', 'purchase_requests', etc. here,
-- following the same principles for foreign key constraints.

-- Indexes for tenant tables
CREATE INDEX idx_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id);
CREATE INDEX idx_recipe_ingredients_ingredient_id ON recipe_ingredients(ingredient_id);
CREATE INDEX idx_products_recipe_id ON products(recipe_id);
CREATE INDEX idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product_id ON sale_items(product_id);
```

### How to Use This Script and Solve Your Deletion Problem

1.  **Run Part 1:** Execute the first part of the script (`PUBLIC SCHEMA`) in your empty `mydeseret_db`. This will create the core tables needed for your application to run.
2.  **Integrate Part 2 into Your Java Code:** The second part (`TENANT SCHEMA TEMPLATE`) is your blueprint. In your Java service where you approve a new business, you will dynamically create a new schema and then execute the SQL from this template to build all the necessary tables for that new bakery.
3.  **Adapt Your Java Application Logic for Soft Deletes:**
    * **Delete Product Endpoint:** Change the `deleteProduct` method in your `ProductService`. Instead of calling `productRepository.deleteById(id)`, it should now find the product, set its `is_active` status to `false`, and save it back.
        ```java
        // In ProductService.java
        public void softDeleteProduct(Long id) {
            Product product = productRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Product not found"));
            product.setActive(false); // Assuming a 'setActive' method from Lombok on an 'isActive' field
            productRepository.save(product);
        }
        ```
    * **Get Products Endpoints:** All methods that fetch products should now only retrieve active ones. In `ProductRepository.java`, you would add:
        ```java
        // In ProductRepository.java
        import java.util.List;
        
        public interface ProductRepository extends JpaRepository<Product, Long> {
            List<Product> findByIsActiveTrue(); // Finds all active products
            Optional<Product> findByIdAndIsActiveTrue(Long id); // Finds an active product by ID
        }
        
