(function () {
  const encoder = new TextEncoder();
  // PBKDF2 делает подбор пароля заметно дороже, чем простой SHA-256.
  const HASH_ITERATIONS = 120000;

  // chrome.storage хранит JSON-совместимые значения, поэтому байты кодируем в base64.
  function bytesToBase64(bytes) {
    const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
    return btoa(binary);
  }

  // Возвращает base64-строку обратно в Uint8Array для проверки пароля.
  function base64ToBytes(base64) {
    const binary = atob(base64);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  }

  // Производит хеш пароля с солью; открытый пароль в storage не сохраняется.
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

  // Создает запись для нового пароля сайта: алгоритм, соль, хеш и дату создания.
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

  // Проверяет введенный пароль против сохраненного хеша без раскрытия исходного пароля.
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

    // Сравнение без раннего выхода снижает утечки через время выполнения.
    let difference = 0;

    for (let index = 0; index < actualHash.length; index += 1) {
      difference |= actualHash[index] ^ expectedHash[index];
    }

    return difference === 0;
  }

  // Экспортируем crypto helpers для popup и content script.
  globalThis.PageLockCrypto = {
    createPasswordRecord,
    verifyPassword
  };
})();
