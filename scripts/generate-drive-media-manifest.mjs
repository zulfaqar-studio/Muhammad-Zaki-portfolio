import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const outputPath = path.join(ROOT, 'client', 'public', 'data', 'drive-media.json');
const generalFolderId = process.env.GOOGLE_DRIVE_PUBLIC_MEDIA_FOLDER_ID || '1OhVnspmFbj3xHOssFVHLABYFdMXx2d_N';
const certificateFolderId = process.env.GOOGLE_DRIVE_PUBLIC_CERT_FOLDER_ID || '1VNTYCQGkWTVspdspvALRhbnE0tURSKL9';
const serviceAccountJson = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON || '';
const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL || '';
const serviceAccountPrivateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const maxDepth = Number(process.env.PUBLIC_DRIVE_MAX_DEPTH || 6);
const maxFiles = Number(process.env.PUBLIC_DRIVE_MAX_FILES || 500);

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function getCredentials() {
  if (serviceAccountEmail && serviceAccountPrivateKey) {
    return { client_email: serviceAccountEmail, private_key: serviceAccountPrivateKey };
  }
  if (serviceAccountJson) {
    try {
      return JSON.parse(serviceAccountJson);
    } catch {
      return JSON.parse(Buffer.from(serviceAccountJson, 'base64').toString('utf8'));
    }
  }
  throw new Error('Google service-account credentials are not configured.');
}

async function getGoogleAccessToken() {
  const credentials = getCredentials();
  if (!credentials?.client_email || !credentials?.private_key) {
    throw new Error('Google service-account credentials are incomplete.');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claim}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(credentials.private_key, 'base64url')}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(`Google Drive authentication failed (${response.status}).`);
  }
  return body.access_token;
}

async function driveRequest(accessToken, url) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Drive request failed (${response.status}): ${body.slice(0, 500)}`);
  }
  return response;
}

async function listFolder(accessToken, folderId) {
  const files = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      pageSize: '1000',
      orderBy: 'name',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,webContentLink,webViewLink,thumbnailLink)'
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await driveRequest(accessToken, `https://www.googleapis.com/drive/v3/files?${params}`);
    const body = await response.json();
    files.push(...(body.files || []));
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return files;
}

function makeViewUrl(file) {
  const mime = String(file.mimeType || '').toLowerCase();
  if (mime.startsWith('image/') || mime.startsWith('video/') || mime === 'application/pdf') {
    return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(file.id)}`;
  }
  return file.webContentLink || file.webViewLink || `https://drive.google.com/open?id=${encodeURIComponent(file.id)}`;
}

async function collectFolder(accessToken, folderId, kind) {
  const result = [];
  const queue = [{ id: folderId, path: '', depth: 0 }];
  const seen = new Set([folderId]);

  while (queue.length && result.length < maxFiles) {
    const current = queue.shift();
    const files = await listFolder(accessToken, current.id);
    for (const file of files) {
      if (result.length >= maxFiles) break;
      const nextPath = current.path ? `${current.path}/${file.name}` : file.name;
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        if (current.depth < maxDepth && !seen.has(file.id)) {
          seen.add(file.id);
          queue.push({ id: file.id, path: nextPath, depth: current.depth + 1 });
        }
        continue;
      }
      result.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size || null,
        modifiedTime: file.modifiedTime || null,
        path: nextPath,
        kind,
        viewUrl: makeViewUrl(file),
        webContentLink: file.webContentLink || null,
        webViewLink: file.webViewLink || null,
        thumbnailLink: file.thumbnailLink || null
      });
    }
  }

  return result;
}

async function main() {
  const token = await getGoogleAccessToken();
  const [general, certificates] = await Promise.all([
    collectFolder(token, generalFolderId, 'general'),
    collectFolder(token, certificateFolderId, 'certificates')
  ]);

  const manifest = {
    generatedAt: new Date().toISOString(),
    sourceFingerprint: process.env.PUBLIC_DRIVE_SOURCE_FINGERPRINT || '',
    source: {
      generalFolderId,
      certificateFolderId
    },
    files: [...general, ...certificates]
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Wrote ${manifest.files.length} Drive media record(s) to ${outputPath}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
