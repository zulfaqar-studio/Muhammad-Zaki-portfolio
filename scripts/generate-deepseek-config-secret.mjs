import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const outputPath = path.join(ROOT, 'client', 'src', 'deepseek-config-secret.js');
const apiKey = String(process.env.DEEPSEEK_API_KEY || '').trim();
const model = String(process.env.DEEPSEEK_MODEL || 'deepseek-flash').trim();
const rounds = 11;
const publicSalt = 'zaki-borb::2026::deepseek-config::v3';

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest();
}

function deriveStream(length) {
  const salt = Buffer.from(publicSalt, 'utf8');
  let state = Buffer.concat([Buffer.from('ZK-BORB-STREAM-V3', 'utf8'), salt]);
  let stream = Buffer.alloc(0);
  for (let i = 0; i < rounds; i += 1) {
    state = sha256(Buffer.concat([state, salt, Buffer.from([i])]));
  }
  for (let block = 0; stream.length < length; block += 1) {
    state = sha256(Buffer.concat([state, salt, Buffer.from(`|${block}|`, 'utf8')]));
    stream = Buffer.concat([stream, state]);
  }
  return stream.subarray(0, length);
}

function encodeKey(value) {
  const raw = Buffer.from(value, 'utf8');
  const stream = deriveStream(raw.length);
  const mixed = Buffer.alloc(raw.length);
  // Always-bijective permutation: rotate, then reverse.
  // Unlike (i * 7 + 13) % length, this works for every key length.
  for (let i = 0; i < raw.length; i += 1) {
    const rotatedIndex = (i + 13) % raw.length;
    const sourceIndex = raw.length - 1 - rotatedIndex;
    mixed[i] = raw[sourceIndex] ^ stream[i];
  }
  const first = mixed.toString('base64url');
  const second = Buffer.from(first, 'utf8').toString('base64url');
  const check = sha256(Buffer.concat([
    Buffer.from('ZK-BORB-CHECK-V3|', 'utf8'),
    Buffer.from(value, 'utf8'),
    Buffer.from(publicSalt, 'utf8')
  ])).toString('base64url');
  return { ciphertext: second, check };
}

const safePlaceholder = `// GENERATED FILE — do not hand-edit.
// In production, GitHub Actions overwrites this file from DEEPSEEK_API_KEY.
// The browser-facing value is intentionally obfuscated, not secret.\n\nexport const DEEPSEEK_CONFIG = Object.freeze({\n  enabled: false,\n  model: ${JSON.stringify(model)},\n  version: 3,\n  rounds: ${rounds},\n  salt: ${JSON.stringify(Buffer.from(publicSalt, 'utf8').toString('base64url'))},\n  payload: '',\n  check: ''\n});\n`;

if (!apiKey) {
  await fs.writeFile(outputPath, safePlaceholder, 'utf8');
  if (process.env.GITHUB_ACTIONS === 'true' || process.env.CI === 'true') {
    throw new Error('DEEPSEEK_API_KEY is missing in the GitHub Actions environment. The production build cannot enable live Borb AI.');
  }
  console.log(`DeepSeek key missing; wrote disabled config to ${path.relative(ROOT, outputPath)} for local development.`);
  process.exit(0);
}

const { ciphertext, check } = encodeKey(apiKey);
const saltB64 = Buffer.from(publicSalt, 'utf8').toString('base64url');

const source = `// GENERATED FILE — DO NOT EDIT OR COMMIT A HAND-WRITTEN KEY HERE.\n// This value is intentionally obfuscated for a public static build.\n// It is NOT equivalent to a private server-side secret.\n\nconst B64 = ${JSON.stringify(saltB64)};\nconst PAYLOAD = ${JSON.stringify(ciphertext)};\nconst CHECK = ${JSON.stringify(check)};\n\nexport const DEEPSEEK_CONFIG = Object.freeze({\n  enabled: true,\n  model: ${JSON.stringify(model)},\n  version: 3,\n  rounds: ${rounds},\n  salt: B64,\n  payload: PAYLOAD,\n  check: CHECK\n});\n`;

await fs.writeFile(outputPath, source, 'utf8');
console.log(`Generated obfuscated DeepSeek config at ${path.relative(ROOT, outputPath)}.`);
