import { DEEPSEEK_CONFIG } from './deepseek-config-secret.js';

function fromBase64Url(value) {
  if (!value) return new Uint8Array();
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}

async function deriveStream(length, saltBytes, rounds) {
  const encoder = new TextEncoder();
  let state = new Uint8Array([
    ...encoder.encode('ZK-BORB-STREAM-V3'),
    ...saltBytes
  ]);

  for (let i = 0; i < rounds; i += 1) {
    const suffix = new Uint8Array([i]);
    state = await sha256(new Uint8Array([...state, ...saltBytes, ...suffix]));
  }

  const out = new Uint8Array(length);
  let offset = 0;
  let block = 0;
  while (offset < length) {
    const marker = encoder.encode(`|${block}|`);
    state = await sha256(new Uint8Array([...state, ...saltBytes, ...marker]));
    const take = Math.min(state.length, length - offset);
    out.set(state.subarray(0, take), offset);
    offset += take;
    block += 1;
  }
  return out;
}

function sourceIndex(i, length) {
  if (!length) return 0;
  const rotatedIndex = (i + 13) % length;
  return length - 1 - rotatedIndex;
}

async function verify(value, saltBytes) {
  const encoder = new TextEncoder();
  const expected = fromBase64Url(DEEPSEEK_CONFIG.check);
  const material = new Uint8Array([
    ...encoder.encode('ZK-BORB-CHECK-V3|'),
    ...encoder.encode(value),
    ...saltBytes
  ]);
  const actual = await sha256(material);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

export async function getDeepSeekApiKey() {
  if (!DEEPSEEK_CONFIG.enabled || !DEEPSEEK_CONFIG.payload || !DEEPSEEK_CONFIG.check) return '';

  const saltBytes = fromBase64Url(DEEPSEEK_CONFIG.salt);
  const secondLayer = new TextDecoder().decode(fromBase64Url(DEEPSEEK_CONFIG.payload));
  const mixed = fromBase64Url(secondLayer);
  const stream = await deriveStream(mixed.length, saltBytes, Number(DEEPSEEK_CONFIG.rounds) || 11);
  const raw = new Uint8Array(mixed.length);

  for (let i = 0; i < mixed.length; i += 1) {
    const source = sourceIndex(i, mixed.length);
    raw[source] = mixed[i] ^ stream[i];
  }

  const value = new TextDecoder().decode(raw);
  return (await verify(value, saltBytes)) ? value : '';
}

export function getDeepSeekModel() {
  return DEEPSEEK_CONFIG.model || 'deepseek-flash';
}
