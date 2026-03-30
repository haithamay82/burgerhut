const { spawn } = require("child_process");
const path = require("path");
const os = require("os");

const root = path.join(__dirname, "..");
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const port = process.env.PORT || "3000";

const nets = os.networkInterfaces();
const v4 = [];
for (const name of Object.keys(nets)) {
  for (const net of nets[name] || []) {
    if (net.family === "IPv4" && !net.internal) {
      v4.push({ name, address: net.address });
    }
  }
}

console.log("");
console.log("  BurgerHut — מהטלפון (אותה רשת Wi‑Fi כמו המחשב):");
if (!v4.length) {
  console.log("  (לא נמצאה כתובת IPv4 חיצונית)");
} else {
  for (const { name, address } of v4) {
    console.log(`    http://${address}:${port}    [${name}]`);
  }
}
console.log("");
console.log("  חשוב:");
console.log("    • כתובת חייבת נקודתיים לפני הפורט — http://IP:3000  (לא /3000)");
console.log("    • הטלפון והמחשב באותה רשת (אותו טווח, למשל 192.168.1.x)");
console.log("    • אם לא נטען: Windows Firewall — הרשה Node.js או פורט " + port + " נכנס");
console.log("      (הרץ PowerShell כמנהל):");
console.log(
  `      netsh advfirewall firewall add rule name="Next dev ${port}" dir=in action=allow protocol=TCP localport=${port}`
);
console.log("");
console.log("  Binding: 0.0.0.0 (כל ממשקי IPv4) — rebuild לא נדרש לזה.");
console.log("");

const child = spawn(
  process.execPath,
  [nextBin, "dev", "-H", "0.0.0.0", "-p", String(port)],
  {
    stdio: "inherit",
    cwd: root,
    env: { ...process.env },
  }
);

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
