// server.js
const express = require("express");
const path = require("path");
const fs = require("fs"); // <-- you need this

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Serve static files from the "public" folder
app.use(express.static(path.join(__dirname, "public")));

// API endpoint to serve flashcards.json
app.get("/api/flashcards", (req, res) => {
  fs.readFile(path.join(__dirname, "flashcards.json"), "utf8", (err, data) => {
    if (err) {
      return res.status(500).json({ error: "Unable to load flashcards" });
    }
    res.json(JSON.parse(data));
  });
});

// API endpoint to save log entries
app.post("/api/log", (req, res) => {
  const { chapter, score, totalCards, chapterTitle } = req.body;
  
  if (!chapter || score === undefined || !totalCards) {
    return res.status(400).json({ error: "Missing required fields: chapter, score, totalCards" });
  }

  // Get client IP address
  const clientIP = req.headers['x-forwarded-for'] || 
                   req.headers['x-real-ip'] || 
                   req.connection.remoteAddress || 
                   req.socket.remoteAddress ||
                   (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
                   req.ip;

  const logEntry = {
    date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
    time: new Date().toTimeString().split(' ')[0], // HH:MM:SS
    chapter: chapter,
    chapterTitle: chapterTitle || `Chapter ${chapter}`,
    score: score,
    totalCards: totalCards,
    percentage: Math.round((score / totalCards) * 100),
    ipAddress: clientIP
  };

  const logsPath = path.join(__dirname, "logs.json");
  
  // Read existing logs or create empty array
  fs.readFile(logsPath, "utf8", (err, data) => {
    let logs = [];
    if (!err && data) {
      try {
        logs = JSON.parse(data);
      } catch (parseErr) {
        console.error("Error parsing logs.json:", parseErr);
      }
    }
    
    // Add new log entry
    logs.push(logEntry);
    
    // Write back to file
    fs.writeFile(logsPath, JSON.stringify(logs, null, 2), (writeErr) => {
      if (writeErr) {
        return res.status(500).json({ error: "Unable to save log entry" });
      }
      res.json({ message: "Log entry saved successfully", entry: logEntry });
    });
  });
});

// API endpoint to get logs
app.get("/api/logs", (req, res) => {
  fs.readFile(path.join(__dirname, "logs.json"), "utf8", (err, data) => {
    if (err) {
      // If file doesn't exist, return empty array
      return res.json([]);
    }
    try {
      const logs = JSON.parse(data);
      res.json(logs);
    } catch (parseErr) {
      res.status(500).json({ error: "Unable to parse logs" });
    }
  });
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
