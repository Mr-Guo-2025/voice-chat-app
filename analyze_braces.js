const fs = require("fs");
const content = fs.readFileSync("temp_check.js", "utf8");
const lines = content.split("\n");

let stack = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === "{") {
      stack.push({ line: i + 1, char: j + 1 });
    } else if (char === "}") {
      if (stack.length === 0) {
        console.log(`Extra closing brace at line ${i + 1}, char ${j + 1}`);
      } else {
        stack.pop();
      }
    }
  }
}

if (stack.length > 0) {
  console.log(`Unclosed braces found: ${stack.length}`);
  console.log("Last 5 unclosed braces:");
  stack.slice(-5).forEach((item) => {
    console.log(`- Line ${item.line}: ${lines[item.line - 1].trim()}`);
  });
} else {
  console.log("Braces are balanced.");
}
