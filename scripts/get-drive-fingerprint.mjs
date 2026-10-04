import crypto from "node:crypto";

const folderId = String(
  process.env.DRIVE_CHATBOT_FOLDER_ID || process.env.DEEPSEEK_SOURCE_DRIVE_FOLDER_ID || ""
).trim();

const serviceAccountEmail = String(
  process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL || ""
).trim();

const serviceAccountPrivateKey = String(
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || ""
).replace(/\\n/g, "\n");

if (!folderId) {
  throw new Error("DRIVE_CHATBOT_FOLDER_ID is missing.");
}

if (!serviceAccountEmail || !serviceAccountPrivateKey) {
  throw new Error("Google service-account credentials are missing.");
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

async function getGoogleAccessToken() {
  const now = Math.floor(Date.now() / 1000);

  const header = base64Url(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT"
    })
  );

  const claim = base64Url(
    JSON.stringify({
      iss: serviceAccountEmail,
      scope: "https://www.googleapis.com/auth/drive.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600
    })
  );

  const unsigned = `${header}.${claim}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();

  const assertion =
    `${unsigned}.${signer.sign(serviceAccountPrivateKey, "base64url")}`;

  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion
      })
    }
  );

  const body = await response.json();

  if (!response.ok || !body.access_token) {
    throw new Error(
      `Google authentication failed (${response.status}).`
    );
  }

  return body.access_token;
}

async function driveRequest(accessToken, url) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Google Drive request failed (${response.status}).`
    );
  }

  return response.json();
}

async function listFolder(accessToken, id) {
  const files = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({
      q: `'${id}' in parents and trashed = false`,
      pageSize: "1000",
      orderBy: "name",
      fields:
        "nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)"
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const body = await driveRequest(
      accessToken,
      `https://www.googleapis.com/drive/v3/files?${params}`
    );

    files.push(...(body.files || []));
    pageToken = body.nextPageToken || "";
  } while (pageToken);

  return files;
}

async function main() {
  const accessToken = await getGoogleAccessToken();

  const queue = [folderId];
  const seenFolders = new Set([folderId]);
  const allFiles = [];

  while (queue.length) {
    const currentFolder = queue.shift();

    const files = await listFolder(
      accessToken,
      currentFolder
    );

    for (const file of files) {
      if (
        file.mimeType ===
        "application/vnd.google-apps.folder"
      ) {
        if (!seenFolders.has(file.id)) {
          seenFolders.add(file.id);
          queue.push(file.id);
        }

        continue;
      }

      allFiles.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size || "",
        modifiedTime: file.modifiedTime || ""
      });
    }
  }

  allFiles.sort((a, b) =>
    a.id.localeCompare(b.id)
  );

  const fingerprintInput = JSON.stringify(allFiles);

  const hash = crypto
    .createHash("sha256")
    .update(fingerprintInput)
    .digest("hex");

  console.log(`Drive fingerprint: ${hash}`);
  console.log(`Drive files checked: ${allFiles.length}`);

  const githubOutput = process.env.GITHUB_OUTPUT;

  if (!githubOutput) {
    throw new Error("GITHUB_OUTPUT is not available.");
  }

  const fs = await import("node:fs/promises");

  await fs.appendFile(
    githubOutput,
    `hash=${hash}\n`,
    "utf8"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});