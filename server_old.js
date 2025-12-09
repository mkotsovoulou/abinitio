const express = require("express");
const path = require("path");
const fs = require("fs");
const db = require("./database");

// Google Cloud Text-to-Speech setup
const textToSpeech = require("@google-cloud/text-to-speech");

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


const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, "public")));

// API endpoint to serve flashcards.json
app.get("/api/flashcards", (req, res) => {
  db.all("SELECT * FROM chapters ORDER BY chapter_code", [], (err, chapters) => {
    if (err) return res.status(500).json({ error: err.message });

    const promises = chapters.map(ch => new Promise((resolve, reject) => {
      db.all(
  `SELECT spanish AS es, english AS en,
          COALESCE(shown_count, 0) AS shown_count,
          COALESCE(known_count, 0) AS known_count
   FROM words
   WHERE chapter_code = ?
   ORDER BY id`,
  [ch.chapter_code],
  (err, words) => {
    if (err) return reject(err);
    resolve({
      chapter: ch.chapter_code,
      title: ch.title,
      totalWords: words.length,
      words
    });
  }
);

    }));

    Promise.all(promises)
      .then(results => res.json(results))
      .catch(err => res.status(500).json({ error: err.message }));
  });
});


app.post("/api/log", (req, res) => {
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
    return res.status(400).json({ error: "Missing required fields: chapter, score, totalCards" });
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
  const chapter_code = chapter;
  const chapter_title = chapterTitle || `Chapter ${chapter}`;
  const words_json = wordsShown ? JSON.stringify(wordsShown) : null;

  // ✅ Insert into session_logs
  db.run(
    `INSERT INTO session_logs
     (date, time, timezone, chapter_code, chapter_title, score, total_cards, percentage, ip_address, words_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [date, time, timezone, chapter_code, chapter_title, score, totalCards, percentage, clientIP, words_json],
    function (err) {
      if (err) {
        console.error("DB insert error:", err);
        return res.status(500).json({ error: err.message });
      }

      // ✅ Update per-word progress
      if (wordsShown && Array.isArray(wordsShown)) {
        wordsShown.forEach(w => {
          const { es, en, known } = w;
          if (!es) return;
          db.run(
            `UPDATE words
             SET shown_count = COALESCE(shown_count, 0) + 1,
                 known_count = COALESCE(known_count, 0) + ?
             WHERE spanish = ? AND english = ?`,
            [known ? 1 : 0, es, en]
          );
        });
      }

      res.json({ message: "Log entry and progress saved", sessionId: this.lastID });
    }
  );
});



// API endpoint to get logs
app.get("/api/logs", (req, res) => {
  db.all(
    `SELECT id, date, time, timezone, chapter_code AS chapter,
            chapter_title AS chapterTitle, score, total_cards AS totalCards,
            percentage, ip_address AS ipAddress
     FROM session_logs
     ORDER BY date DESC, time DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});


// Add a new word to a chapter
app.post("/api/add-word", (req, res) => {
  const { chapter_code, spanish, english } = req.body || {};
  if (!chapter_code || !spanish || !english) {
    return res.status(400).json({ error: "Missing data" });
  }

  db.run(
    "INSERT INTO words (chapter_code, spanish, english) VALUES (?, ?, ?)",
    [chapter_code.trim(), spanish.trim(), english.trim()],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID, message: "Word added successfully" });
    }
  );
});



// ✅ Delete a word
app.post("/api/delete-word", (req, res) => {
  const { chapter_code, spanish, english } = req.body;
  if (!chapter_code || !spanish) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  db.run(
    "DELETE FROM words WHERE chapter_code = ? AND spanish = ? AND english = ?",
    [chapter_code, spanish, english],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Word deleted", changes: this.changes });
    }
  );
});

// ✅ Google Cloud Text-to-Speech endpoint
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

    console.log(`🔊 Generated voice using: ${voiceName || "es-ES-Neural2-A"}`);
    res.set("Content-Type", "audio/mpeg");
    res.send(response.audioContent);
  } catch (err) {
    console.error("TTS error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/progress", (req, res) => {
  db.all(
    `SELECT chapter_code, COUNT(*) AS total,
            SUM(known_count) AS known,
            ROUND(SUM(known_count) * 100.0 / COUNT(*), 1) AS mastery
     FROM words
     GROUP BY chapter_code`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});


// Fallback to index.html (in case you’re using a single page app)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});


// Heroku provides the PORT via environment variable
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Spanish Words App running on port ${PORT}`);
});


