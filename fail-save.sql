-- Disable foreign key checks temporarily for a cleaner drop (optional but safer)
-- SET session_replication_role = 'replica';

-- 1. Drop all existing tenant-specific schemas
-- This will remove all data and tables for individual bakeries.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'bakery_%') LOOP
        EXECUTE 'DROP SCHEMA IF EXISTS ' || quote_ident(r.schema_name) || ' CASCADE;';
        RAISE NOTICE 'Dropped tenant schema: %', r.schema_name;
    END LOOP;
END $$;

-- 2. Drop tables in the public schema (reverse order of dependencies)
-- This ensures foreign key constraints don't block drops.
DROP TABLE IF EXISTS User_Roles CASCADE;
DROP TABLE IF EXISTS Users CASCADE;
DROP TABLE IF EXISTS Tenants CASCADE; -- Renamed from Bakeries
DROP TABLE IF EXISTS Roles CASCADE;

-- 3. Create tables in the public schema (order of dependencies)

-- Roles Table
CREATE TABLE Roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tenants Table (formerly Bakeries)
CREATE TABLE Tenants (
    tenant_id SERIAL PRIMARY KEY,
    tenant_name VARCHAR(100) UNIQUE NOT NULL,
    schema_name VARCHAR(100) UNIQUE NOT NULL, -- Stores the name of the dedicated schema for this tenant
    owner_user_id INT, -- References Users table, but can be NULL initially or if owner is deleted
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users Table
CREATE TABLE Users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(100) UNIQUE,
    first_name VARCHAR(50),
    last_name VARCHAR(50),
    tenant_id INT, -- Foreign key to Tenants table (nullable for Super Admin or during registration flow)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tenant_id) REFERENCES Tenants(tenant_id) ON DELETE SET NULL -- If a tenant is deleted, users associated with it will have tenant_id set to NULL
);

-- Add foreign key constraint to Tenants.owner_user_id after Users table is created
ALTER TABLE Tenants
ADD CONSTRAINT fk_owner_user
FOREIGN KEY (owner_user_id) REFERENCES Users(user_id) ON DELETE SET NULL;


-- User_Roles Junction Table
CREATE TABLE User_Roles (
    user_role_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    role_id INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, role_id), -- A user can only have a specific role once
    FOREIGN KEY (user_id) REFERENCES Users(user_id) ON DELETE CASCADE, -- If user is deleted, their roles are deleted
    FOREIGN KEY (role_id) REFERENCES Roles(role_id) ON DELETE CASCADE  -- If role is deleted, users with that role will lose it
);

-- 4. Insert default roles
INSERT INTO Roles (role_name) VALUES
('Store Owner'),
('Admin'),
('Baker'),
('Cashier'),
('Super Admin')
ON CONFLICT (role_name) DO NOTHING; -- Prevents errors if roles already exist (e.g., if you run this script partially)

-- Re-enable foreign key checks (if you disabled them)
-- SET session_replication_role = 'origin';

-- Optional: Reset sequences to start from 1 for fresh IDs
ALTER SEQUENCE roles_role_id_seq RESTART WITH 1;
ALTER SEQUENCE tenants_tenant_id_seq RESTART WITH 1;
ALTER SEQUENCE users_user_id_seq RESTART WITH 1;
ALTER SEQUENCE user_roles_user_role_id_seq RESTART WITH 1;

-- Note: Tenant-specific tables (Products, Ingredients, Recipes, Sales, Purchase_Requests,
-- and their respective junction tables) are NOT created here.
-- They are created dynamically by your Node.js backend (in auth-routes.js)
-- when a new bakery (tenant) is registered.
