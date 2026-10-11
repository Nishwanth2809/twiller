import { createServer } from "node:http";

const localDatabase = /^mongodb:\/\/127\.0\.0\.1:27017\/twiller_phase3_acceptance\?replicaSet=phase1$/;
if (
  process.env.NODE_ENV !== "test" ||
  process.env.TWILLER_LOCAL_ACCEPTANCE !== "true" ||
  process.env.TWILLER_LOCAL_AUTH_EMULATOR !== "true" ||
  process.env.PORT !== "5055" ||
  !localDatabase.test(process.env.MONGODB_URI || "")
) {
  throw new Error("Local acceptance harness requires explicit test flags and its isolated loopback database");
}

// Media URLs must target the isolated backend that serves the uploaded files.
// Never let local acceptance avatars accidentally point at the normal dev server.
const acceptanceMediaBase = "http://127.0.0.1:5055";
process.env.MEDIA_PUBLIC_BASE_URL = acceptanceMediaBase;

const { app, mailDependencies, startServer } = await import("../index.js");
const { default: mongoose } = await import("mongoose");
const mailbox = new Map();
const isLocalTestRecipient = email => /^[^@\s]+@example\.(?:test|com)$/i.test(email);
const isLocalResetLink = value => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname) && url.port === "9099" && url.pathname === "/emulator/action";
  } catch { return false; }
};
mailDependencies.send = async ({ to, html }) => {
  const email = String(to || "").toLowerCase();
  const otp = String(html || "").match(/<strong>(\d{6})<\/strong>/)?.[1];
  const resetLink = String(html || "").match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&");
  if (!isLocalTestRecipient(email) || (!otp && !isLocalResetLink(resetLink))) throw new Error("Local acceptance mail sink rejected the message");
  const messages = mailbox.get(email) || {};
  if (otp) messages.otp = otp;
  else messages.resetLink = resetLink;
  mailbox.set(email, messages);
};

const mailboxServer = createServer((req, res) => {
  const remote = req.socket.remoteAddress;
  if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote)) {
    res.writeHead(403).end();
    return;
  }
  const url = new URL(req.url || "/", "http://127.0.0.1:5056");
  const mailboxField = url.pathname === "/otp" ? "otp" : url.pathname === "/reset-link" ? "resetLink" : null;
  if (req.method !== "GET" || !mailboxField) {
    res.writeHead(404).end();
    return;
  }
  const email = (url.searchParams.get("email") || "").toLowerCase();
  const messages = isLocalTestRecipient(email) ? mailbox.get(email) : undefined;
  const value = messages?.[mailboxField];
  if (!value) {
    res.writeHead(404, { "Cache-Control": "no-store" }).end();
    return;
  }
  delete messages[mailboxField];
  if (Object.keys(messages).length) mailbox.set(email, messages);
  else mailbox.delete(email);
  res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify({ [mailboxField]: value }));
});

// Keep both acceptance-only listeners on loopback, even though Express normally binds all interfaces.
const appListen = app.listen;
app.listen = function (port, ...args) { return appListen.call(this, port, "127.0.0.1", ...args); };
let backend;
try {
  backend = await startServer();
  await new Promise(resolve => backend.listening ? resolve() : backend.once("listening", resolve));
  await new Promise((resolve, reject) => mailboxServer.listen(5056, "127.0.0.1", error => error ? reject(error) : resolve()));
  console.log("Local acceptance backend is ready on 127.0.0.1:5055; one-time test codes/reset links are available through the loopback mailbox.");
} catch (error) {
  mailboxServer.close();
  if (backend) backend.close();
  await mongoose.disconnect().catch(() => {});
  throw error;
}

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  backend.closeAllConnections();
  await Promise.all([
    new Promise(resolve => backend.close(resolve)),
    new Promise(resolve => mailboxServer.close(resolve)),
  ]);
  await mongoose.disconnect();
  process.exit(0);
}
process.on("SIGINT", () => { void stop(); });
process.on("SIGTERM", () => { void stop(); });
