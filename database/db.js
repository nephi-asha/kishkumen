const { Pool } = require("pg");
const { param } = require("../router/auth-routes");
require("dotenv").config();

let pool;

const connectionString = process.env.CONNECTION_STRING;

if (!connectionString) {
  throw new Error("CONNECTION_STRING environment variable is not set.");
}

if (process.env.NODE_ENV === "development") {
  pool = new Pool({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  });
} else {
  // Use this for non-dev environments
  pool = new Pool({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false
    }
  });
}

pool.on('connect', () => {
  console.log('Connected to PostgreSQL database!');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// A small utility to sanitize the schema name to prevent SQL injection.
// It checks if the schema name contains only alphanumeric characters and underscores.
// This is crucial for security since schema names cannot be parameterized.
function sanitizeSchemaName(schemaName) {
  if (!schemaName || !/^[a-zA-Z0-9_]+$/.test(schemaName)) {
    throw new Error('Invalid schema name provided.');
  }
  return schemaName;
}

module.exports = {
  // The main query function.
  // It takes an optional schemaName. If provided, it's used to prepend the schema to tables.
  // This function is designed to handle the multi-tenant architecture.
  async query(text, params = [], schemaName = null) {
    try {
      let fullText = text;
      // Replace the placeholder '$1' for the schema name with the actual, sanitized schema name.
      if (schemaName) {
        const sanitizedSchema = sanitizeSchemaName(schemaName);
        fullText = fullText.replace(/\$1/g, sanitizedSchema);
        // The first parameter in the original query is now the schema name, so shift the params array.
        // This is a simple but effective way to handle the schema name placeholder.
        // NOTE: The original query text should use '$1' as a placeholder for the schema.
        // For other parameters, it should use '$2', '$3', etc.
        // The logic below adjusts for a schema-less query where the params
        // are used as-is.
        if (text.includes('$1')) {
          const actualParams = params.slice(1); // Assuming the schema name is the first parameter.
          const res = await pool.query(fullText, actualParams);
          return res;
        }
      }

      // If no schemaName is provided or the query doesn't need it,
      // execute the query with the provided parameters as-is.
      const res = await pool.query(text, params);
      return res;

    } catch (error) {
      console.error("Error executing query:", { text, error: error.message });
      throw error;
    }
  },
  pool: pool,
};
