const fs = require("fs");
const content = fs.readFileSync("public/index.html", "utf8");
const lines = content.split("\n");
// Script starts at line 664 (index 663) and ends at line 1751 (index 1750)
// But let's be dynamic. Find the last <script> tag.
const startMarker = "<script>";
const endMarker = "</script>";
let startIndex = -1;
let endIndex = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes(startMarker) && i > 660) {
    startIndex = i;
  }
  if (lines[i].includes(endMarker)) {
    endIndex = i;
  }
}

if (startIndex !== -1 && endIndex !== -1) {
  const scriptLines = lines.slice(startIndex + 1, endIndex);
  fs.writeFileSync("temp_check.js", scriptLines.join("\n"));
  console.log(`Extracted ${scriptLines.length} lines to temp_check.js`);
} else {
  console.error("Could not find script block");
}
