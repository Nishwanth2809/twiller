// Provider acceptance is not proof of inbox delivery. Never log addresses,
// message content, provider responses, or credentials.
const MAX_HTML_BYTES = 49152;
const recipientPattern = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

function deliveryFailure() {
  const error = new Error("Email delivery is unavailable");
  error.code = "EMAIL_DELIVERY_FAILED";
  return error;
}

export function mailFields(options) {
  if (!options || typeof options !== "object" || Array.isArray(options) ||
    typeof options.to !== "string" || options.to.length > 254 || !recipientPattern.test(options.to) ||
    typeof options.subject !== "string" || !options.subject.trim() || options.subject.length > 200 || /[\r\n]/.test(options.subject) ||
    typeof options.html !== "string" || !options.html.trim() || Buffer.byteLength(options.html, "utf8") > MAX_HTML_BYTES)
    throw deliveryFailure();
  return { to: options.to, subject: options.subject, html: options.html };
}

export function validMailFrom(sender) {
  if (typeof sender !== "string" || sender !== sender.trim() || sender.length > 254 || /[\r\n]/.test(sender)) return false;
  if (recipientPattern.test(sender)) return true;
  const named = sender.match(/^([^<>]{1,80}) <([^<>]+)>$/);
  return Boolean(named?.[1].trim() && recipientPattern.test(named[2]));
}

export function resendMailOptions(options, sender) {
  if (!validMailFrom(sender)) throw deliveryFailure();
  return { ...mailFields(options), from: sender };
}

export function smtpMailOptions(options, sender) {
  if (typeof sender !== "string" || !recipientPattern.test(sender)) throw deliveryFailure();
  return { ...mailFields(options), from: { name: "Twiller", address: sender } };
}

export async function deliverEmail(mailOptions, {
  resendApiKey,
  mailFrom,
  sendResend,
  sendSmtp,
  logger = console,
}) {
  const mail = mailFields(mailOptions);
  const diagnostic = (provider, reason, status) => logger.error("Email delivery attempt failed", {
    provider, reason, ...(Number.isInteger(status) && status >= 400 && status <= 599 ? { httpStatus: status } : {}),
  });

  if (resendApiKey) {
    try {
      const result = await sendResend(resendMailOptions(mail, mailFrom));
      if (result?.error) {
        diagnostic("resend", "PROVIDER_REJECTED", result.error.statusCode);
      } else if (typeof result?.data?.id === "string" && result.data.id.length > 0) {
        return { provider: "resend", success: true };
      } else {
        diagnostic("resend", "INVALID_RESPONSE");
      }
    } catch {
      diagnostic("resend", "NETWORK_FAILURE");
    }
  }

  if (typeof sendSmtp === "function") {
    try {
      const result = await sendSmtp(mail);
      if (Array.isArray(result?.accepted) && result.accepted.length > 0 && !result.rejected?.length)
        return { provider: "smtp", success: true };
      diagnostic("smtp", "NOT_ACCEPTED");
    } catch {
      diagnostic("smtp", "DELIVERY_FAILURE");
    }
  }
  throw deliveryFailure();
}
