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
console.log("  BurgerHut production — phone URLs:");
if (v4.length) {
  for (const { name, address } of v4) {
    console.log(`    http://${address}:${port}    [${name}]`);
  }
}
console.log("");

const child = spawn(
  process.execPath,
  [nextBin, "start", "-H", "0.0.0.0", "-p", String(port)],
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
