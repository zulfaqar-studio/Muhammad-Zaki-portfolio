import crypto from "node:crypto";

const GENERAL_ROOT = String(process.env.GOOGLE_DRIVE_PUBLIC_MEDIA_FOLDER_ID || "").trim();
const CERT_ROOT = String(process.env.GOOGLE_DRIVE_PUBLIC_CERT_FOLDER_ID || "").trim();
const SERVICE_EMAIL = String(process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL || "").trim();
const SERVICE_KEY = String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();

const MAX_FOLDERS = 250;
const MAX_FILES = 1000;
let tokenCache = { accessToken: "", expiresAt: 0 };
const requestCounts = new Map();

function cors(request) {
  const origin = request.headers.get("origin");
  if (!origin) return {};

  const allowed = String(
    process.env.PUBLIC_API_ORIGINS ||
    "https://zulfaqar-studio.github.io,http://localhost:5173"
  ).split(",").map((value) => value.trim()).filter(Boolean);

  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  if (!allowed.includes("*") && !allowed.includes(origin) && !local) return {};

  return {
    "Access-Control-Allow-Origin": allowed.includes("*") ? "*" : origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { "X-Content-Type-Options": "nosniff", ...headers }
  });
}

function normalize(value) {
  return String(value || "")
    .replaceAll("\\", "/")
    .replace(/^\/+/, "")
    .replace(/^public\//i, "")
    .replace(/^\.\/+/, "")
    .toLowerCase();
}

function imageUrl(id) {
  return "https://drive.google.com/uc?export=view&id=" + encodeURIComponent(id);
}

async function getAccessToken() {
  if (tokenCache.accessToken && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.accessToken;
  }

  if (!SERVICE_EMAIL || !SERVICE_KEY) {
    throw new Error("Google Drive service-account credentials are not configured.");
  }

  const now = Math.floor(Date.now() / 1000);
  const b64 = (value) => Buffer.from(value).toString("base64url");
  const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64(JSON.stringify({
    iss: SERVICE_EMAIL,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const unsigned = header + "." + claim;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = unsigned + "." + signer.sign(SERVICE_KEY, "base64url");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok || !body.access_token) {
    throw new Error("Google Drive authentication failed.");
  }

  tokenCache = {
    accessToken: body.access_token,
    expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000
  };
  return tokenCache.accessToken;
}

async function listFolder(accessToken, folderId) {
  const files = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({
      q: "'" + folderId.replaceAll("'", "\\'") + "' in parents and trashed = false",
      pageSize: "1000",
      orderBy: "name",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
      fields: "nextPageToken,files(id,name,mimeType,webContentLink,webViewLink)"
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch("https://www.googleapis.com/drive/v3/files?" + params, {
      headers: {
        Authorization: "Bearer " + accessToken,
        Accept: "application/json"
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error("Google Drive request failed.");

    files.push(...(body.files || []));
    pageToken = body.nextPageToken || "";
  } while (pageToken);

  return files;
}

async function findMedia(reference) {
  const requested = normalize(reference);
  if (!requested) return null;

  const directMatch = String(reference).match(/^drive:\/\/(.+)$/i);
  if (directMatch?.[1]) {
    return {
      id: directMatch[1],
      name: directMatch[1],
      url: imageUrl(directMatch[1])
    };
  }

  const targetName = requested.split("/").pop();
  const roots = [
    GENERAL_ROOT ? { id: GENERAL_ROOT, root: "media" } : null,
    CERT_ROOT ? { id: CERT_ROOT, root: "certificates" } : null
  ].filter(Boolean);

  if (!roots.length) throw new Error("Public Google Drive folders are not configured.");

  const accessToken = await getAccessToken();
  const queue = roots.map((entry) => ({ ...entry, path: "" }));
  const seen = new Set(roots.map((entry) => entry.id));
  let folderCount = 0;
  let fileCount = 0;
  let best = null;

  while (queue.length && folderCount < MAX_FOLDERS && fileCount < MAX_FILES) {
    const current = queue.shift();
    folderCount += 1;

    for (const file of await listFolder(accessToken, current.id)) {
      if (file.mimeType === "application/vnd.google-apps.folder") {
        if (!seen.has(file.id)) {
          seen.add(file.id);
          queue.push({
            id: file.id,
            root: current.root,
            path: current.path ? current.path + "/" + file.name : file.name
          });
        }
        continue;
      }

      fileCount += 1;
      const candidatePath = normalize(
        current.path ? current.path + "/" + file.name : file.name
      );
      const name = normalize(file.name);
      const mime = String(file.mimeType || "").toLowerCase();

      if (!mime.startsWith("image/")) continue;
      if (name !== targetName && candidatePath !== requested) continue;

      const exactPath = candidatePath === requested;
      const score = exactPath ? 2 : 1;

      if (!best || score > best.score) {
        best = {
          score,
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          path: current.root + "/" + candidatePath,
          url: imageUrl(file.id),
          viewUrl: file.webViewLink || null
        };
      }

      if (exactPath) return best;
    }
  }

  return best;
}

function allowedRate(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0].trim() || "unknown";
  const now = Date.now();
  const previous = requestCounts.get(ip);

  if (!previous || now - previous.startedAt >= 60_000) {
    requestCounts.set(ip, { startedAt: now, count: 1 });
    return true;
  }

  previous.count += 1;
  return previous.count <= 30;
}

export async function GET(request) {
  const headers = cors(request);

  if (!allowedRate(request)) {
    return json({ ok: false, error: "Media lookup rate limit reached." }, 429, {
      ...headers,
      "Retry-After": "60"
    });
  }

  try {
    const url = new URL(request.url);
    const reference = String(url.searchParams.get("ref") || "").trim();

    if (!reference) {
      return json({ ok: false, error: "Media reference is required." }, 400, headers);
    }

    const media = await findMedia(reference);
    if (!media) {
      return json({ ok: false, found: false }, 404, {
        ...headers,
        "Cache-Control": "public, max-age=60"
      });
    }

    return json({ ok: true, found: true, ...media }, 200, {
      ...headers,
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400"
    });
  } catch (error) {
    console.error("GET /api/media failed:", error);
    return json(
      { ok: false, error: error.message || "Unable to search Google Drive." },
      503,
      headers
    );
  }
}

export function OPTIONS(request) {
  return new Response(null, {
    status: 204,
    headers: { ...cors(request), "Cache-Control": "no-store" }
  });
}
