import crypto from 'node:crypto';

const serviceAccountEmail = String(process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL || '').trim();
const serviceAccountPrivateKey = String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const mediaFolderId = String(process.env.GOOGLE_DRIVE_PUBLIC_MEDIA_FOLDER_ID || '').trim();
const certFolderId = String(process.env.GOOGLE_DRIVE_PUBLIC_CERT_FOLDER_ID || '').trim();

if (!serviceAccountEmail || !serviceAccountPrivateKey) throw new Error('Google service-account credentials are missing.');
if (!mediaFolderId && !certFolderId) throw new Error('At least one public Drive folder ID is required.');

function base64Url(value) { return Buffer.from(value).toString('base64url'); }

async function getGoogleAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64Url(JSON.stringify({ iss: serviceAccountEmail, scope: 'https://www.googleapis.com/auth/drive.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const unsigned = `${header}.${claim}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(serviceAccountPrivateKey, 'base64url')}`;
  const response = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(`Google authentication failed (${response.status}).`);
  return body.access_token;
}

async function listFolder(accessToken, folderId) {
  const all = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      pageSize: '1000',
      orderBy: 'name',
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)'
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Google Drive request failed (${response.status}).`);
    all.push(...(body.files || []));
    pageToken = body.nextPageToken || '';
  } while (pageToken);
  return all;
}

async function collect(accessToken, rootId, label, output) {
  if (!rootId) return;
  const queue = [{ id: rootId, path: '' }];
  const seen = new Set([rootId]);
  while (queue.length) {
    const current = queue.shift();
    const files = await listFolder(accessToken, current.id);
    for (const file of files) {
      const nextPath = current.path ? `${current.path}/${file.name}` : file.name;
      if (file.mimeType === 'application/vnd.google-apps.folder') {
        if (!seen.has(file.id)) {
          seen.add(file.id);
          queue.push({ id: file.id, path: nextPath });
        }
        continue;
      }
      output.push({ root: label, id: file.id, name: file.name, path: nextPath, mimeType: file.mimeType, size: file.size || '', modifiedTime: file.modifiedTime || '' });
    }
  }
}

async function main() {
  const token = await getGoogleAccessToken();
  const files = [];
  await collect(token, mediaFolderId, 'media', files);
  await collect(token, certFolderId, 'certificates', files);
  files.sort((a, b) => `${a.root}/${a.path}/${a.id}`.localeCompare(`${b.root}/${b.path}/${b.id}`));
  const hash = crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex');
  const fs = await import('node:fs/promises');
  await fs.appendFile(process.env.GITHUB_OUTPUT, `hash=${hash}\n`, 'utf8');
  console.log(`Public Drive fingerprint: ${hash}`);
  console.log(`Public Drive files checked: ${files.length}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
