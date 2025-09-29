const express = require("express");
const path = require("path");
const fs = require("fs");
const app = express();
const PORT = 3000;

const chapters = JSON.parse(fs.readFileSync(path.join(__dirname, "flashcards.json"), "utf-8"));

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/flashcards", (req, res) => {
  res.json(chapters);
});

app.listen(PORT, () => {
  console.log(`Flashcards app running at http://localhost:${PORT}`);
});