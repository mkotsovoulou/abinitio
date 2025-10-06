// import_flashcards.js
const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const dbPath = path.join(__dirname, "flashcards.db");
const flashcardsPath = path.join(__dirname, "flashcards.json");

// Load JSON data
const data = JSON.parse(fs.readFileSync(flashcardsPath, "utf8"));

// Connect to SQLite
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // Create tables if not exist
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

  const insertChapter = db.prepare("INSERT OR IGNORE INTO chapters (chapter_code, title) VALUES (?, ?)");
  const insertWord = db.prepare("INSERT INTO words (chapter_code, spanish, english) VALUES (?, ?, ?)");

  data.forEach(ch => {
    const chapterCode = ch.chapter;
    const title = ch.title || "(no title)";
    insertChapter.run(chapterCode, title);

    if (ch.words && ch.words.length > 0) {
      ch.words.forEach(w => {
        insertWord.run(chapterCode, w.es, w.en);
      });
    }
  });

  insertChapter.finalize();
  insertWord.finalize();

  console.log("✅ Import completed successfully!");
});

db.close();
