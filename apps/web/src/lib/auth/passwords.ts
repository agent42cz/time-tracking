/**
 * Password hashing — argon2id, OWASP-recommended params (memory: 19 MiB,
 * time: 2, parallelism: 1). Argon2 generates per-call salt, so the hash
 * is fully self-contained in the encoded string.
 */
import argon2 from 'argon2';

const HASH_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, HASH_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
