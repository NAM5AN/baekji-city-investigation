const COOKIE_NAME = "baekji_admin_session";
const MAX_SESSION_SECONDS = 12 * 60 * 60;

export function parseCookies(header = "") {
  return String(header || "").split(";").reduce((output, pair) => {
    const index = pair.indexOf("=");
    if (index < 0) return output;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) output[key] = value;
    return output;
  }, {});
}

export function adminSessionTokenFromRequest(request) {
  const cookies = parseCookies(request?.headers?.cookie || "");
  return String(cookies[COOKIE_NAME] || "");
}

export function adminSessionCookie(token, { maxAgeSeconds = MAX_SESSION_SECONDS } = {}) {
  return `${COOKIE_NAME}=${String(token || "")}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(60, Math.min(MAX_SESSION_SECONDS, Number(maxAgeSeconds) || MAX_SESSION_SECONDS))}`;
}

export function clearAdminSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export { COOKIE_NAME, MAX_SESSION_SECONDS };
