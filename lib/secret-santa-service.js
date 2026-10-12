import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { family } from './family.js';
import { assignmentsFor, revealTokenFor, verifyAccessCode, verifyRevealToken } from './secret-santa.js';

function privateKey(secret) {
  return createHash('sha256').update(`family-secret-santa-2026:email:${secret}`).digest();
}

function encryptEmail(email, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', privateKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(email, 'utf8'), cipher.final()]);
  return { encrypted: encrypted.toString('base64url'), iv: iv.toString('base64url'), tag: cipher.getAuthTag().toString('base64url') };
}

function decryptEmail(record, secret) {
  const decipher = createDecipheriv('aes-256-gcm', privateKey(secret), Buffer.from(record.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(record.encrypted, 'base64url')), decipher.final()]).toString('utf8');
}

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  return email;
}

function publicStatus(records, mailConfigured) {
  const joined = family.filter(person => records.some(record => record.person === person.id)).map(person => person.id);
  return { joined, count: joined.length, total: family.length, complete: joined.length === family.length, mailConfigured };
}

export function createSecretSantaService(store, { secret, siteUrl, mailer = null }) {
  if (!secret) throw new Error('Secret Santa is not configured.');
  const personalLink = personId => `${siteUrl.replace(/\/$/, '')}/?draw=${encodeURIComponent(personId)}&token=${encodeURIComponent(revealTokenFor(personId, secret))}#draw`;

  async function records() {
    return (await store.listJoins()).filter(record => family.some(person => person.id === record.person));
  }

  async function status() {
    return publicStatus(await records(), Boolean(mailer));
  }

  async function dispatchIfReady(currentRecords) {
    if (!mailer || currentRecords.length !== family.length) return;
    for (const person of family) {
      if (await store.hasMail(person.id)) continue;
      const record = currentRecords.find(item => item.person === person.id);
      if (!record) continue;
      try {
        await mailer.send({ to: decryptEmail(record.email, secret), name: person.name, link: personalLink(person.id) });
        await store.markMail(person.id);
      } catch (error) {
        console.error('Secret Santa email delivery failed:', person.id, error.name || 'Error');
      }
    }
  }

  return {
    status,
    async join(input) {
      if (!input || !verifyAccessCode(input.person, input.code, secret)) throw new Error('That name and private code do not match.');
      const email = normalizeEmail(input.email);
      const prior = (await records()).find(record => record.person === input.person);
      await store.putJoin({
        person: input.person,
        email: encryptEmail(email, secret),
        joinedAt: prior?.joinedAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      const currentRecords = await records();
      const currentStatus = publicStatus(currentRecords, Boolean(mailer));
      await dispatchIfReady(currentRecords);
      const recipient = currentStatus.complete ? assignmentsFor(secret).get(input.person) : null;
      return {
        status: currentStatus,
        personalLink: personalLink(input.person),
        recipient: recipient ? { id: recipient.id, name: recipient.name } : null
      };
    },
    async reveal(input) {
      const authorized = verifyAccessCode(input?.person, input?.code, secret) || verifyRevealToken(input?.person, input?.token, secret);
      if (!authorized) throw new Error('That private draw link or code is not valid.');
      const currentRecords = await records();
      const currentStatus = publicStatus(currentRecords, Boolean(mailer));
      await dispatchIfReady(currentRecords);
      if (!currentStatus.complete) return { status: currentStatus, locked: true, personalLink: personalLink(input.person) };
      const recipient = assignmentsFor(secret).get(input.person);
      return { status: currentStatus, locked: false, recipient: { id: recipient.id, name: recipient.name }, personalLink: personalLink(input.person) };
    }
  };
}
