/**
 * Endpoint security helpers shared by every note-generation transport.
 *
 * Remote model endpoints must use HTTPS. Explicit loopback addresses are
 * allowed for local development and locally hosted model transports.
 */

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"])

/**
 * True for hostnames that are guaranteed to stay on the local machine.
 * Accepts `localhost`, any `*.localhost` name, the whole 127.0.0.0/8 range,
 * and the IPv6 loopback (with or without brackets).
 */
export function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "")

  if (LOOPBACK_HOSTNAMES.has(normalized)) {
    return true
  }

  if (normalized.endsWith(".localhost")) {
    return true
  }

  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(normalized)
}

/**
 * Parse and validate an endpoint URL before any PHI is sent to it.
 *
 * @param rawUrl endpoint to validate
 * @param label human-readable name used in error messages (never contains PHI)
 * @returns the parsed URL when it is safe to use
 */
export function assertSecureEndpoint(rawUrl: string, label: string): URL {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(`Invalid ${label} URL: ${rawUrl}`)
  }

  if (parsed.protocol === "https:") {
    return parsed
  }

  if (parsed.protocol === "http:" && isLoopbackHostname(parsed.hostname)) {
    return parsed
  }

  throw new Error(
    `SECURITY ERROR: ${label} must use HTTPS under the secure transport policy. ` +
      `Received: ${parsed.protocol}//${parsed.host}`,
  )
}
