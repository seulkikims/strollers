const fs = require("node:fs");
const path = require("node:path");

function loadCatalog() {
  const indexPath = path.resolve(__dirname, "..", "index.html");
  const html = fs.readFileSync(indexPath, "utf8");
  const match = html.match(/var catalog = (\{[\s\S]*?\n      \});\n\n      var strollers/);
  if (!match) {
    throw new Error("Unable to locate the inline catalog in index.html.");
  }
  return Function(`"use strict"; return (${match[1]});`)();
}

module.exports = { loadCatalog };
