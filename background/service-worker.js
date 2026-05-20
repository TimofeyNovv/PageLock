const api = globalThis.browser || globalThis.chrome;

// Хранит разблокированные сайты по tabId, если browser.storage.session недоступен.
const memoryUnlocks = new Map();

// Делает стабильный ключ для session storage конкретной вкладки.
function getUnlockKey(tabId) {
  return `pagelock:unlocked:${tabId}`;
}

// Возвращает список доменов, уже разблокированных в этой вкладке.
async function getUnlockedSites(tabId) {
  if (api.storage.session) {
    const result = await api.storage.session.get({ [getUnlockKey(tabId)]: [] });
    return result[getUnlockKey(tabId)];
  }

  return memoryUnlocks.get(tabId) || [];
}

// Сохраняет список разблокированных доменов до закрытия вкладки.
async function setUnlockedSites(tabId, sites) {
  if (api.storage.session) {
    await api.storage.session.set({ [getUnlockKey(tabId)]: sites });
    return;
  }

  memoryUnlocks.set(tabId, sites);
}

// Добавляет домен в список временно разблокированных для текущей вкладки.
async function unlockTab(tabId, siteKey) {
  const sites = await getUnlockedSites(tabId);

  if (!sites.includes(siteKey)) {
    sites.push(siteKey);
    await setUnlockedSites(tabId, sites);
  }

  return { ok: true };
}

// Проверяет, был ли домен уже разблокирован в этой вкладке.
async function isTabUnlocked(tabId, siteKey) {
  const sites = await getUnlockedSites(tabId);
  return { unlocked: sites.includes(siteKey) };
}

// Центральная точка обработки сообщений от content script.
async function handleMessage(message, sender) {
  const tabId = sender.tab && sender.tab.id;

  if (!tabId && tabId !== 0) {
    return { ok: false, error: "Missing tab id." };
  }

  if (message.type === "PAGELOCK_IS_UNLOCKED") {
    return isTabUnlocked(tabId, message.siteKey);
  }

  if (message.type === "PAGELOCK_UNLOCK_TAB") {
    return unlockTab(tabId, message.siteKey);
  }

  return { ok: false, error: "Unknown message." };
}

// WebExtensions требует вернуть true, чтобы ответить асинхронно через sendResponse.
api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

// При закрытии вкладки очищаем временную разблокировку.
api.tabs.onRemoved.addListener((tabId) => {
  memoryUnlocks.delete(tabId);

  if (api.storage.session) {
    api.storage.session.remove(getUnlockKey(tabId));
  }
});
