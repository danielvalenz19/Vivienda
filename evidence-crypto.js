'use strict';

// El identificador se autentica para impedir intercambiar archivos entre registros.
const crypto = require('node:crypto');
const MAGIC = Buffer.from('VGT-EV1\0', 'ascii');

function readKey(value) {
  if (!value) return null;
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error('EVIDENCE_ENCRYPTION_KEY debe contener 64 caracteres hexadecimales.');
  return Buffer.from(value, 'hex');
}

function encryptEvidence(data, key, id) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(id, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), ciphertext]);
}

function decryptEvidence(data, key, id) {
  if (!key || data.length < MAGIC.length + 28 || !data.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('Evidencia cifrada no disponible.');
  const offset = MAGIC.length;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, data.subarray(offset, offset + 12));
  decipher.setAAD(Buffer.from(id, 'utf8'));
  decipher.setAuthTag(data.subarray(offset + 12, offset + 28));
  return Buffer.concat([decipher.update(data.subarray(offset + 28)), decipher.final()]);
}

module.exports = { readKey, encryptEvidence, decryptEvidence };
