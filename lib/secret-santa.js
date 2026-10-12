import { createHmac, timingSafeEqual } from 'node:crypto';
import { family } from './family.js';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const label = 'family-secret-santa-2026';

function hmac(secret, purpose, personId) {
  return createHmac('sha256', secret).update(`${label}:${purpose}:${personId}`).digest();
}

function encodeCode(bytes) {
  let code = '';
  for (let index = 0; code.length < 12; index += 1) code += alphabet[bytes[index] % alphabet.length];
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8)}`;
}

function normalizeCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z2-9]/g, '');
}

export function accessCodeFor(personId, secret) {
  if (!family.some(person => person.id === personId) || !secret) throw new Error('Invalid Secret Santa configuration.');
  return encodeCode(hmac(secret, 'access', personId));
}

export function assignmentsFor(secret) {
  if (!secret) throw new Error('Invalid Secret Santa configuration.');
  const order = family
    .map(person => ({ person, key: hmac(secret, 'order', person.id).toString('hex') }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(entry => entry.person);
  return new Map(order.map((person, index) => [person.id, order[(index + 1) % order.length]]));
}

export function revealRecipient(personId, suppliedCode, secret) {
  const person = family.find(entry => entry.id === personId);
  if (!person || typeof suppliedCode !== 'string' || suppliedCode.length > 64 || !secret) return null;
  const expected = normalizeCode(accessCodeFor(personId, secret));
  const supplied = normalizeCode(suppliedCode);
  const validLength = supplied.length === expected.length;
  const candidate = Buffer.from(validLength ? supplied : expected);
  const valid = timingSafeEqual(Buffer.from(expected), candidate) && validLength;
  return valid ? assignmentsFor(secret).get(personId) : null;
}
