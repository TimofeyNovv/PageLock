const api = globalThis.PageLockApi;

const elements = {
  site: document.getElementById("site"),
  status: document.getElementById("status"),
  message: document.getElementById("message"),
  addButton: document.getElementById("add-button"),
  removeButton: document.getElementById("remove-button"),
  form: document.getElementById("password-form"),
  label: document.getElementById("password-label"),
  input: document.getElementById("password-input"),
  submitButton: document.getElementById("submit-button")
};

let activeTab = null;
let activeSiteKey = null;
let blockedSites = {};
let formMode = null;

async function getActiveTab() {
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function loadState() {
  activeTab = await getActiveTab();

  if (!activeTab || !activeTab.url) {
    elements.site.textContent = "Нет активной страницы.";
    elements.addButton.disabled = true;
    elements.removeButton.disabled = true;
    return;
  }

  activeSiteKey = PageLockSite.getSiteKeyFromUrl(activeTab.url);

  if (!activeSiteKey) {
    elements.site.textContent = "Эту страницу нельзя заблокировать.";
    elements.addButton.disabled = true;
    elements.removeButton.disabled = true;
    return;
  }

  const result = await api.storage.local.get({ blockedSites: {} });
  blockedSites = result.blockedSites;
  renderState();
}

function renderState() {
  const isBlocked = Boolean(blockedSites[activeSiteKey]);

  elements.site.textContent = activeSiteKey;
  elements.status.textContent = isBlocked ? "Сайт в черном списке." : "Сайт не заблокирован.";
  elements.addButton.disabled = isBlocked;
  elements.removeButton.disabled = !isBlocked;
}

function showForm(mode) {
  formMode = mode;
  elements.form.hidden = false;
  elements.input.value = "";
  elements.message.textContent = "";

  if (mode === "add") {
    elements.label.textContent = "Новый пароль для сайта";
    elements.submitButton.textContent = "Добавить";
  } else {
    elements.label.textContent = "Пароль для удаления сайта";
    elements.submitButton.textContent = "Удалить";
  }

  elements.input.focus();
}

async function notifyActiveTab(message) {
  if (!activeTab || !activeTab.id) {
    return;
  }

  try {
    await api.tabs.sendMessage(activeTab.id, message);
  } catch (error) {
    // The content script is not available on browser internal pages.
  }
}

async function addSite(password) {
  const record = await PageLockCrypto.createPasswordRecord(password);
  blockedSites[activeSiteKey] = record;
  await api.storage.local.set({ blockedSites });
  elements.message.textContent = "Сайт добавлен в черный список.";
  await notifyActiveTab({ type: "PAGELOCK_RECHECK" });
}

async function removeSite(password) {
  const record = blockedSites[activeSiteKey];
  const isPasswordValid = await PageLockCrypto.verifyPassword(password, record);

  if (!isPasswordValid) {
    elements.message.textContent = "Неверный пароль.";
    elements.input.value = "";
    elements.input.focus();
    return;
  }

  delete blockedSites[activeSiteKey];
  await api.storage.local.set({ blockedSites });
  elements.message.textContent = "Сайт удален из черного списка.";
  await notifyActiveTab({
    type: "PAGELOCK_REMOVE_OVERLAY",
    siteKey: activeSiteKey
  });
}

elements.addButton.addEventListener("click", () => showForm("add"));
elements.removeButton.addEventListener("click", () => showForm("remove"));

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const password = elements.input.value;

  if (!password) {
    elements.message.textContent = "Введите пароль.";
    return;
  }

  elements.submitButton.disabled = true;

  try {
    if (formMode === "add") {
      await addSite(password);
    } else {
      await removeSite(password);
    }

    elements.form.hidden = true;
    await loadState();
  } finally {
    elements.submitButton.disabled = false;
  }
});

loadState();
