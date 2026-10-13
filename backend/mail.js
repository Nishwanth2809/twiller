// Transport acknowledgement is not a guarantee of inbox delivery.
// Never log recipients, message contents, provider URLs, or raw provider errors.
const MAX_PAYLOAD_BYTES = 65536;
const MAX_HTML_BYTES = 49152;
const recipientPattern = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

function deliveryFailure() {
  const error = new Error("Email delivery is unavailable");
  error.code = "EMAIL_DELIVERY_FAILED";
  return error;
}

export function mailFields(options) {
  if(!options || typeof options!=="object" || Array.isArray(options) ||
    typeof options.to!=="string" || options.to.length>254 || !recipientPattern.test(options.to) ||
    typeof options.subject!=="string" || !options.subject.trim() || options.subject.length>200 || /[\r\n]/.test(options.subject) ||
    typeof options.html!=="string" || !options.html.trim() || Buffer.byteLength(options.html,"utf8")>MAX_HTML_BYTES)
    throw deliveryFailure();
  return {to:options.to,subject:options.subject,html:options.html};
}

export function smtpMailOptions(options, sender) {
  if(typeof sender!=="string" || !recipientPattern.test(sender))throw deliveryFailure();
  return {...mailFields(options),from:{name:"Twiller",address:sender}};
}

export async function deliverEmail(mailOptions, {
  appsScriptUrl,
  appsScriptSecret,
  sendSmtp,
  fetchImpl = globalThis.fetch,
  logger = console,
  timeoutMs = 10000,
}) {
  const mail = mailFields(mailOptions);
  const diagnostic = (provider, reason, status) => logger.error("Email delivery attempt failed", {
    provider, reason, ...(Number.isInteger(status) ? { httpStatus: status } : {}),
  });
  if (appsScriptUrl) {
    if(typeof appsScriptSecret!=="string" || appsScriptSecret.length<32 || appsScriptSecret.length>256 || /\s/.test(appsScriptSecret))
      throw deliveryFailure();
    const body = JSON.stringify({secret:appsScriptSecret,mail});
    if(Buffer.byteLength(body,"utf8")>MAX_PAYLOAD_BYTES)throw deliveryFailure();
    const controller = new AbortController();
    let timer;
    let reason = "NETWORK_FAILURE";
    let status;
    let awaitingRedirectAcknowledgement = false;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reason = awaitingRedirectAcknowledgement ? "ACK_TIMEOUT" : "TIMEOUT";
          reject(new Error("Email provider timeout"));
          controller.abort();
        }, timeoutMs);
      });
      const attempt = (async () => {
        let response = await fetchImpl(appsScriptUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
          // ContentService serves its acknowledgement through a one-time
          // script.googleusercontent.com redirect. Inspect that hop so a
          // redirect to a different host cannot receive the request secret.
          redirect: "manual",
        });
        if ([302, 303].includes(response.status)) {
          reason = "INVALID_REDIRECT";
          const location = response.headers?.get("location");
          const redirect = location && new URL(location, appsScriptUrl);
          if (!redirect || redirect.protocol !== "https:" || redirect.hostname !== "script.googleusercontent.com" ||
              redirect.username || redirect.password) throw new Error("Unexpected email provider redirect");
          // The provider's one-time URL is never logged or sent any secret.
          response.body?.cancel?.().catch(() => {});
          reason = "REDIRECT_FAILURE";
          awaitingRedirectAcknowledgement = true;
          response = await fetchImpl(redirect, { method: "GET", signal: controller.signal, redirect: "error" });
        }
        status = response.status;
        if (!response.ok) {
          reason = "HTTP_FAILURE";
          throw new Error("Email provider HTTP failure");
        }
        reason = "INVALID_RESPONSE";
        const result = await response.json();
        // The Apps Script must acknowledge send completion with boolean success.
        if (!result || typeof result !== "object" || Array.isArray(result) || result.success !== true) {
          reason = result?.success === false ? "PROVIDER_REJECTED" : "INVALID_RESPONSE";
          throw new Error("Email provider did not confirm delivery");
        }
        return { provider: "apps_script", success: true };
      })();
      return await Promise.race([attempt, timeout]);
    } catch {
      controller.abort();
      diagnostic("apps_script", reason, status);
    } finally {
      clearTimeout(timer);
    }
  }
  if (typeof sendSmtp !== "function") throw deliveryFailure();
  try {
    const result = await sendSmtp(mail);
    if (!Array.isArray(result?.accepted) || result.accepted.length === 0 || result.rejected?.length) {
      diagnostic("smtp", "NOT_ACCEPTED");
      throw new Error("SMTP did not accept message");
    }
    return { provider: "smtp", success: true };
  } catch {
    diagnostic("smtp", "DELIVERY_FAILURE");
    // Routes map this to their existing safe error contracts.
    throw deliveryFailure();
  }
}
