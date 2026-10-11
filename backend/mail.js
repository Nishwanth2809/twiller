// Transport acknowledgement is not a guarantee of inbox delivery.
// Never log recipients, message contents, provider URLs, or raw provider errors.
export async function deliverEmail(mailOptions, {
  appsScriptUrl,
  sendSmtp,
  fetchImpl = globalThis.fetch,
  logger = console,
  timeoutMs = 10000,
}) {
  const diagnostic = (provider, reason, status) => logger.error("Email delivery attempt failed", {
    provider, reason, ...(Number.isInteger(status) ? { httpStatus: status } : {}),
  });
  if (appsScriptUrl) {
    const controller = new AbortController();
    let timer;
    let reason = "NETWORK_FAILURE";
    let status;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reason = "TIMEOUT";
          reject(new Error("Email provider timeout"));
          controller.abort();
        }, timeoutMs);
      });
      const attempt = (async () => {
        const response = await fetchImpl(appsScriptUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(mailOptions),
          signal: controller.signal,
        });
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
  try {
    const result = await sendSmtp(mailOptions);
    if (!Array.isArray(result?.accepted) || result.accepted.length === 0 || result.rejected?.length) {
      diagnostic("smtp", "NOT_ACCEPTED");
      throw new Error("SMTP did not accept message");
    }
    return { provider: "smtp", success: true };
  } catch {
    diagnostic("smtp", "DELIVERY_FAILURE");
    // Routes map this to their existing safe error contracts.
    const error = new Error("Email delivery is unavailable");
    error.code = "EMAIL_DELIVERY_FAILED";
    throw error;
  }
}
