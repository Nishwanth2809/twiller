// Standalone staging web app. Deploy as the dedicated staging sender account.
// Store APPS_SCRIPT_SECRET in Script Properties, never in this source or its URL.
const MAX_REQUEST_BYTES = 65536;
const MAX_HTML_BYTES = 49152;
const RECIPIENT = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

function mailResult(success) {
  return ContentService.createTextOutput(JSON.stringify({ success: success }))
    .setMimeType(ContentService.MimeType.JSON);
}

function sameSecret(supplied, expected) {
  if (typeof supplied !== "string" || typeof expected !== "string" || expected.length < 32) return false;
  const left = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, supplied, Utilities.Charset.UTF_8);
  const right = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, expected, Utilities.Charset.UTF_8);
  let mismatch = 0;
  for (let i = 0; i < right.length; i++) mismatch |= left[i] ^ right[i];
  return mismatch === 0;
}

function validMail(mail) {
  return mail && typeof mail === "object" && !Array.isArray(mail) &&
    Object.keys(mail).sort().join(",") === "html,subject,to" &&
    typeof mail.to === "string" && mail.to.length <= 254 && RECIPIENT.test(mail.to) &&
    typeof mail.subject === "string" && !!mail.subject.trim() && mail.subject.length <= 200 && !/[\r\n]/.test(mail.subject) &&
    typeof mail.html === "string" && !!mail.html.trim() &&
    Utilities.newBlob(mail.html).getBytes().length <= MAX_HTML_BYTES;
}

function doPost(e) {
  try {
    if (!e || !e.postData || typeof e.postData.contents !== "string" ||
        !/^application\/json(?:\s*;|$)/i.test(e.postData.type || "") ||
        (typeof e.contentLength === "number" && e.contentLength > MAX_REQUEST_BYTES) ||
        Utilities.newBlob(e.postData.contents).getBytes().length > MAX_REQUEST_BYTES) return mailResult(false);
    const request = JSON.parse(e.postData.contents);
    if (!request || typeof request !== "object" || Array.isArray(request) ||
        Object.keys(request).sort().join(",") !== "mail,secret") return mailResult(false);
    const expected = PropertiesService.getScriptProperties().getProperty("APPS_SCRIPT_SECRET");
    if (!sameSecret(request.secret, expected) || !validMail(request.mail)) return mailResult(false);

    // MailApp uses the account executing this web app as sender. Ignore caller-supplied identity.
    MailApp.sendEmail({
      to: request.mail.to,
      subject: request.mail.subject,
      body: "Open this message in an HTML-capable email client.",
      htmlBody: request.mail.html,
      name: "Twiller",
    });
    return mailResult(true);
  } catch (_) {
    // Do not log request bodies, recipients, codes, links, secrets, or provider errors.
    return mailResult(false);
  }
}
