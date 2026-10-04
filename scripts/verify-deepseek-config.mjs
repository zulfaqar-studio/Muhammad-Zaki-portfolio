import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

const ROOT = process.cwd();
const configPath = path.join(ROOT, 'client', 'src', 'deepseek-config-secret.js');
const text = await fs.readFile(configPath, 'utf8');

const read = (name) => {
  const match = text.match(new RegExp(`(?:const\\s+)?${name}\\s*=\\s*(['\\"])(.*?)\\1`));
  return match?.[2] || '';
};
const enabled = /enabled:\s*true/.test(text);
const rounds = Number((text.match(/rounds:\s*(\d+)/) || [,''])[1]);
const salt = read('B64');
const payload = read('PAYLOAD');
const check = read('CHECK');

if (!enabled || !salt || !payload || !check || !rounds) {
  throw new Error('Generated DeepSeek browser config is disabled or incomplete. Check the global DEEPSEEK_API_KEY secret.');
}

function fromBase64Url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}
function sha256(input) { return crypto.createHash('sha256').update(input).digest(); }
function deriveStream(length, saltBytes) {
  let state = Buffer.concat([Buffer.from('ZK-BORB-STREAM-V3'), saltBytes]);
  for (let i = 0; i < rounds; i += 1) state = sha256(Buffer.concat([state, saltBytes, Buffer.from([i])]));
  const out = Buffer.alloc(length);
  let offset = 0;
  for (let block = 0; offset < length; block += 1) {
    state = sha256(Buffer.concat([state, saltBytes, Buffer.from(`|${block}|`)]));
    state.copy(out, offset, 0, Math.min(state.length, length - offset));
    offset += Math.min(state.length, length - offset);
  }
  return out;
}
const saltBytes = fromBase64Url(salt);
const secondLayer = fromBase64Url(payload).toString('utf8');
const mixed = fromBase64Url(secondLayer);
const stream = deriveStream(mixed.length, saltBytes);
const raw = Buffer.alloc(mixed.length);
for (let i = 0; i < mixed.length; i += 1) {
  const rotatedIndex = (i + 13) % mixed.length;
  const sourceIndex = mixed.length - 1 - rotatedIndex;
  raw[sourceIndex] = mixed[i] ^ stream[i];
}
const value = raw.toString('utf8');
const expected = fromBase64Url(check);
const actual = sha256(Buffer.concat([Buffer.from('ZK-BORB-CHECK-V3|'), Buffer.from(value), saltBytes]));
if (!crypto.timingSafeEqual(actual, expected)) {
  throw new Error('Generated DeepSeek browser config failed its integrity check.');
}
if (!value.startsWith('sk-') || value.length < 20) {
  throw new Error('Generated DeepSeek browser config does not decode to a plausible API key.');
}

console.log('DeepSeek browser config verified successfully (key value not printed).');
