import { boundedBody, StudyApiError } from "@/lib/studyApi";

const authReads = new Set(["v1/projects", "v2/recaptchaConfig", "v2/passwordPolicy"]);
const authWrites = new Set([
  "v1/accounts:signUp",
  "v1/accounts:signInWithPassword",
  "v1/accounts:signInWithIdp",
  "v1/accounts:lookup",
  "v1/accounts:sendOobCode",
]);
const forwardedHeaders = [
  "content-type", "authorization", "x-client-version", "x-firebase-client",
  "x-firebase-gmpid", "x-firebase-appcheck", "x-firebase-locale",
  "x-goog-api-client", "x-goog-request-params", "google-cloud-resource-prefix",
];

function failure(status: number, message: string) {
  return Response.json({ error: { code: status, message } }, {
    status, headers: { "Cache-Control": "no-store" },
  });
}

function firestoreEndpoint(path: string, projectId: string) {
  const documents = "v1/projects/" + projectId + "/databases/(default)/documents";
  if (path === documents + ":batchGet" || path === documents + ":commit") return true;
  if (!path.startsWith(documents + "/zhiyiUsers/") || !path.endsWith(":runQuery")) return false;
  const owner = path.slice(documents.length + "/zhiyiUsers/".length, -":runQuery".length);
  return /^[A-Za-z0-9_-]{1,128}$/u.test(owner);
}

async function relay(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) return failure(503, "NETWORK_REQUEST_FAILED");

  const origin = new URL(request.url);
  const requestOrigin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const host = request.headers.get("host") || origin.host;
  if (fetchSite === "cross-site" || (fetchSite !== "same-origin" &&
      requestOrigin && (!URL.canParse(requestOrigin) || new URL(requestOrigin).host !== host))) {
    return failure(403, "REQUEST_FORBIDDEN");
  }
  const [service, ...parts] = (await context.params).path;
  const path = parts.join("/");
  const post = request.method === "POST";
  const suppliedKey = origin.searchParams.get("key");
  if (suppliedKey && suppliedKey !== apiKey) return failure(403, "API_KEY_INVALID");

  let upstream: URL;
  if (service === "auth") {
    if (post && path === "v1/token") {
      upstream = new URL("https://securetoken.googleapis.com/v1/token");
    } else if (post ? authWrites.has(path) : authReads.has(path)) {
      upstream = new URL(path, "https://identitytoolkit.googleapis.com/");
      for (const key of ["clientType", "version"]) {
        const value = origin.searchParams.get(key);
        if (value) upstream.searchParams.set(key, value);
      }
    } else {
      return failure(404, "OPERATION_NOT_ALLOWED");
    }
  } else if (service === "firestore" && post && firestoreEndpoint(path, projectId)) {
    if (!/^Bearer \S+$/u.test(request.headers.get("authorization") ?? "")) {
      return failure(401, "UNAUTHENTICATED");
    }
    upstream = new URL(path, "https://firestore.googleapis.com/");
  } else {
    return failure(404, "OPERATION_NOT_ALLOWED");
  }
  upstream.searchParams.set("key", apiKey);

  const headers = new Headers();
  for (const name of forwardedHeaders) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("Referer", (process.env.RENDER_EXTERNAL_URL || origin.origin) + "/");
  try {
    const body = post
      ? await boundedBody(request, service === "auth" ? 64 * 1024 : 10 * 1024 * 1024).arrayBuffer()
      : undefined;
    if (service === "auth" && path === "v1/accounts:sendOobCode") {
      const payload = JSON.parse(new TextDecoder().decode(body));
      if (payload?.requestType !== "VERIFY_EMAIL" || typeof payload.idToken !== "string") {
        return failure(400, "INVALID_REQ_TYPE");
      }
    }
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(25_000)]),
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof StudyApiError) return failure(error.status, "REQUEST_TOO_LARGE");
    if (error instanceof SyntaxError) return failure(400, "INVALID_REQ_TYPE");
    return failure(503, "NETWORK_REQUEST_FAILED");
  }
}

export const GET = relay;
export const POST = relay;
