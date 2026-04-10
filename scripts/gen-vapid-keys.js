/**
 * מדפיס זוג מפתחות VAPID להדבקה ב־.env / Vercel.
 * שימוש: npm run vapid:keys
 */
const webpush = require("web-push");

const keys = webpush.generateVAPIDKeys();
console.log("\nהוסיפו ל־.env.local או ל־Vercel:\n");
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`);
console.log("VAPID_SUBJECT=mailto:your-email@example.com\n");
