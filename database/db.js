const { Pool } = require("pg");
require("dotenv").config();

let pool;

const connectionString = process.env.DATABASE_URL || process.env.EXTERNAL_URL;

if (process.env.NODE_ENV === "development") {
  pool = new Pool({
    connectionString: connectionString,
    ssl: {
      rejectUnauthorized: false,
    },
  });
} else {
  // Use this for now to rule out SSL issues in non-dev environments too
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

module.exports = {
  async query(text, params) {
    try {
      const res = await pool.query(text, params);
      return res;
    } catch (error) {
      console.error("Error executing query:", { text, error: error.message });
      throw error;
    }
  },
  pool: pool
};