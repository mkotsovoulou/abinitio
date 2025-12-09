const express = require("express");
const path = require("path");
const fs = require("fs");
const db = require("./database");   // NOW TURSO

// Google Cloud Text-to-Speech
const textToSpeech = require("@google-cloud/text-to-speech");

// ──────────────────────────────────────────────────────────────
// GOOGLE TTS CREDENTIALS
// ──────────────────────────────────────────────────────────────
let credentialsPath;
if (process.env.GOOGLE_TTS_KEY) {
  try {
    const tempPath = path.join(__dirname, "google-tts-key-temp.json");
    fs.writeFileSync(tempPath, process.env.GOOGLE_TTS_KEY);
    credentialsPath = tempPath;
    console.log("✅ Google TTS key loaded from Heroku config var");
  } catch (err) {
    console.error("❌ Could not write temp credentials file:", err);
  }
} else {
  credentialsPath = path.join(__dirname, "google-tts-key.json");
  console.log("✅ Google TTS key loaded from local file");
}

let ttsClient;
try {
  ttsClient = new textToSpeech.TextToSpeechClient({
    keyFilename: credentialsPath,
  });
  console.log("✅ Google TTS client initialized");
} catch (err) {
  console.error("❌ Failed to initialize TTS client:", err);
}

// ──────────────────────────────────────────────────────────────
// EXPRESS APP
// ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ──────────────────────────────────────────────────────────────
// GET FLASHCARDS (Chapters + Words)
// ──────────────────────────────────────────────────────────────
app.get("/api/flashcards", async (req, res) => {
  try {
    const chapters = (await db.execute("SELECT * FROM chapters ORDER BY chapter_code")).rows;

    const results = [];
    for (const ch of chapters) {
      const words = (await db.execute(
        `SELECT spanish AS es, english AS en,
                COALESCE(shown_count,0) AS shown_count,
                COALESCE(known_count,0) AS known_count
         FROM words
         WHERE chapter_code = ?
         ORDER BY id`,
        [ch.chapter_code]
      )).rows;

      results.push({
        chapter: ch.chapter_code,
        title: ch.title,
        totalWords: words.length,
        words
      });
    }

    res.json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// LOG SESSION + UPDATE WORD PROGRESS
// ──────────────────────────────────────────────────────────────
app.post("/api/log", async (req, res) => {
  try {
    const {
      chapter,
      score,
      totalCards,
      chapterTitle,
      clientDate,
      clientTime,
      clientTimezone,
      wordsShown
    } = req.body || {};

    if (!chapter || score === undefined || !totalCards) {
      return res.status(400).json({ error: "Missing required fields" });
    }
    if (totalCards === 0) {
      return res.status(400).json({ error: "No cards in session" });
    }

    const clientIP =
      req.headers["x-forwarded-for"] ||
      req.headers["x-real-ip"] ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.ip;

    const date = clientDate || new Date().toISOString().split("T")[0];
    const time = clientTime || new Date().toTimeString().split(" ")[0];
    const timezone = clientTimezone || "Unknown";
    const percentage = Math.round((score / totalCards) * 100);

    const words_json = wordsShown ? JSON.stringify(wordsShown) : null;

    // INSERT LOG
    const insertResult = await db.execute(
      `INSERT INTO session_logs
       (date, time, timezone, chapter_code, chapter_title, score, total_cards, percentage, ip_address, words_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        date, time, timezone,
        chapter,
        chapterTitle || `Chapter ${chapter}`,
        score,
        totalCards,
        percentage,
        clientIP,
        words_json
      ]
    );

    const sessionId = insertResult.lastInsertRowid;

    // UPDATE PROGRESS
    if (wordsShown && Array.isArray(wordsShown)) {
      for (const w of wordsShown) {
        await db.execute(
          `UPDATE words
           SET shown_count = COALESCE(shown_count,0) + 1,
               known_count = COALESCE(known_count,0) + ?
           WHERE spanish = ? AND english = ?`,
          [w.known ? 1 : 0, w.es, w.en]
        );
      }
    }

    res.json({ message: "Log entry and progress saved", sessionId });

  } catch (err) {
    console.error("DB insert error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// GET LOGS
// ──────────────────────────────────────────────────────────────
app.get("/api/logs", async (req, res) => {
  try {
    const logs = (await db.execute(
      `SELECT id, date, time, timezone, chapter_code AS chapter,
              chapter_title AS chapterTitle, score, total_cards AS totalCards,
              percentage, ip_address AS ipAddress
       FROM session_logs
       ORDER BY date DESC, time DESC`
    )).rows;

    res.json(logs);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// ADD WORD
// ──────────────────────────────────────────────────────────────
app.post("/api/add-word", async (req, res) => {
  try {
    const { chapter_code, spanish, english } = req.body || {};
    if (!chapter_code || !spanish || !english) {
      return res.status(400).json({ error: "Missing data" });
    }

    const insert = await db.execute(
      `INSERT INTO words (chapter_code, spanish, english)
       VALUES (?, ?, ?)`,
      [chapter_code.trim(), spanish.trim(), english.trim()]
    );

    res.json({ id: insert.lastInsertRowid, message: "Word added successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// DELETE WORD
// ──────────────────────────────────────────────────────────────
app.post("/api/delete-word", async (req, res) => {
  try {
    const { chapter_code, spanish, english } = req.body;
    if (!chapter_code || !spanish) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    const result = await db.execute(
      `DELETE FROM words WHERE chapter_code = ? AND spanish = ? AND english = ?`,
      [chapter_code, spanish, english]
    );

    res.json({ message: "Word deleted", changes: result.rowsAffected });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// GOOGLE TTS
// ──────────────────────────────────────────────────────────────
app.post("/api/tts", async (req, res) => {
  try {
    const { text, lang, voiceName } = req.body;
    if (!text) return res.status(400).json({ error: "Missing text" });

    const [response] = await ttsClient.synthesizeSpeech({
      input: { text },
      voice: {
        languageCode: lang || "es-ES",
        name: voiceName || "es-ES-Neural2-A",
      },
      audioConfig: { audioEncoding: "MP3", speakingRate: 1.0 },
    });

    res.set("Content-Type", "audio/mpeg");
    res.send(response.audioContent);
  } catch (err) {
    console.error("TTS error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// PROGRESS SUMMARY
// ──────────────────────────────────────────────────────────────
app.get("/api/progress", async (req, res) => {
  try {
    const rows = (await db.execute(
      `SELECT chapter_code,
              COUNT(*) AS total,
              SUM(known_count) AS known,
              ROUND(SUM(known_count) * 100.0 / COUNT(*), 1) AS mastery
       FROM words
       GROUP BY chapter_code`
    )).rows;

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────────────────────
// SPA FALLBACK
// ──────────────────────────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Spanish Words App running on port ${PORT}`);
});
