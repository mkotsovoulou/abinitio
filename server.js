// server.js
const express = require("express");
const path = require("path");

const app = express();

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


// Fallback to index.html (in case you’re using a single page app)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Heroku provides the PORT via environment variable
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Spanish Words App running on port ${PORT}`);
});
