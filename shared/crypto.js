(function () {
  const encoder = new TextEncoder();
  const HASH_ITERATIONS = 120000;

  function bytesToBase64(bytes) {
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  async function derivePasswordHash(password, salt) {
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: HASH_ITERATIONS,
        hash: "SHA-256"
      },
      keyMaterial,
      256
    );

    return new Uint8Array(bits);
  }

  async function createPasswordRecord(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await derivePasswordHash(password, salt);

    return {
      algorithm: "PBKDF2-SHA-256",
      iterations: HASH_ITERATIONS,
      salt: bytesToBase64(salt),
      hash: bytesToBase64(hash),
      createdAt: new Date().toISOString()
    };
  }

  async function verifyPassword(password, record) {
    if (!record || record.algorithm !== "PBKDF2-SHA-256") {
      return false;
    }

    const salt = base64ToBytes(record.salt);
    const expectedHash = base64ToBytes(record.hash);
    const actualHash = await derivePasswordHash(password, salt);

    if (actualHash.length !== expectedHash.length) {
      return false;
    }

    let difference = 0;

    for (let index = 0; index < actualHash.length; index += 1) {
      difference |= actualHash[index] ^ expectedHash[index];
    }

    return difference === 0;
  }

  globalThis.PageLockCrypto = {
    createPasswordRecord,
    verifyPassword
  };
})();
