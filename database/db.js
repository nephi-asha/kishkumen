// db.js

const { Pool } = require("pg");
const { param } = require("../router/auth-routes"); // This line is likely a mistake and should be removed.
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

function sanitizeSchemaName(schemaName) {
  if (!schemaName || !/^[a-zA-Z0-9_]+$/.test(schemaName)) {
    throw new Error('Invalid schema name provided.');
  }
  return schemaName;
}

module.exports = {
  // The main query function.
  // It takes an optional schemaName. If provided, it's used to prepend the schema to tables.
  async query(text, params = [], schemaName = null) {
    try {
      let fullText = text;

      if (schemaName) {
        const sanitizedSchema = sanitizeSchemaName(schemaName);
        fullText = `SET search_path TO ${sanitizedSchema}, public; ${text}`;
      }

      // Execute the query with the provided parameters as-is.
      const res = await pool.query(fullText, params);
      return res;

    } catch (error) {
      console.error("Error executing query:", { text, error: error.message });
      throw error;
    }
  },
  pool: pool,
};