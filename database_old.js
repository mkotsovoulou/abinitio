// database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// database file stored in the same directory as server.js
const dbPath = path.join(__dirname, 'flashcards.db');

// open (or create) the database
const db = new sqlite3.Database(dbPath);

// create tables if they don't exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS chapters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_code TEXT UNIQUE,
    title TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chapter_code TEXT,
    spanish TEXT,
    english TEXT,
    FOREIGN KEY (chapter_code) REFERENCES chapters(chapter_code)
  )`);
});

db.run(`ALTER TABLE words ADD COLUMN known_count INTEGER DEFAULT 0`, err => {});
db.run(`ALTER TABLE words ADD COLUMN shown_count INTEGER DEFAULT 0`, err => {});

db.run(`CREATE TABLE IF NOT EXISTS session_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  time TEXT,
  timezone TEXT,
  chapter_code TEXT,
  chapter_title TEXT,
  score INTEGER,
  total_cards INTEGER,
  percentage REAL,
  ip_address TEXT,
  words_json TEXT
)`);


module.exports = db;
