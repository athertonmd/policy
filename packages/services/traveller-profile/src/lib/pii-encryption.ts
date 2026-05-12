/**
 * PII Encryption/Decryption using AWS KMS
 *
 * Encrypts and decrypts personally identifiable information (PII) fields
 * using tenant-specific KMS keys. This ensures PII is encrypted at rest
 * with tenant-level key isolation.
 */

import { KMSClient, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';

const kmsClient = new KMSClient({});

/**
 * Encrypts a field value using the specified KMS key.
 *
 * @param value - The plaintext value to encrypt
 * @param kmsKeyArn - The ARN of the tenant-specific KMS key
 * @returns Base64-encoded ciphertext
 */
export async function encryptField(value: string, kmsKeyArn: string): Promise<string> {
  if (!value) {
    return '';
  }

  const command = new EncryptCommand({
    KeyId: kmsKeyArn,
    Plaintext: Buffer.from(value, 'utf-8'),
  });

  const response = await kmsClient.send(command);

  if (!response.CiphertextBlob) {
    throw new Error('KMS encryption returned no ciphertext');
  }

  return Buffer.from(response.CiphertextBlob).toString('base64');
}

/**
 * Decrypts a field value using KMS.
 * KMS automatically determines the correct key from the ciphertext metadata.
 *
 * @param encryptedValue - Base64-encoded ciphertext
 * @param kmsKeyArn - The ARN of the tenant-specific KMS key (used for validation)
 * @returns The decrypted plaintext value
 */
export async function decryptField(
  encryptedValue: string,
  kmsKeyArn: string
): Promise<string> {
  if (!encryptedValue) {
    return '';
  }

  const command = new DecryptCommand({
    CiphertextBlob: Buffer.from(encryptedValue, 'base64'),
    KeyId: kmsKeyArn,
  });

  const response = await kmsClient.send(command);

  if (!response.Plaintext) {
    throw new Error('KMS decryption returned no plaintext');
  }

  return Buffer.from(response.Plaintext).toString('utf-8');
}

/**
 * Encrypts a JSON object (e.g., passport details, emergency contact).
 *
 * @param data - The object to encrypt
 * @param kmsKeyArn - The ARN of the tenant-specific KMS key
 * @returns Base64-encoded encrypted JSON string
 */
export async function encryptJsonField(
  data: Record<string, unknown>,
  kmsKeyArn: string
): Promise<string> {
  const jsonString = JSON.stringify(data);
  return encryptField(jsonString, kmsKeyArn);
}

/**
 * Decrypts a JSON object from an encrypted field.
 *
 * @param encryptedValue - Base64-encoded encrypted JSON string
 * @param kmsKeyArn - The ARN of the tenant-specific KMS key
 * @returns The decrypted object
 */
export async function decryptJsonField<T = Record<string, unknown>>(
  encryptedValue: string,
  kmsKeyArn: string
): Promise<T> {
  const jsonString = await decryptField(encryptedValue, kmsKeyArn);
  return JSON.parse(jsonString) as T;
}
