// database.js - Turso Cloud DB connection
const { createClient } = require("@libsql/client");

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.AUTH_TOKEN,
});

module.exports = db;
