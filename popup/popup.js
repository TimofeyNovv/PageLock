const api = globalThis.PageLockApi;

const elements = {
  site: document.getElementById("site"),
  status: document.getElementById("status"),
  endpoint: document.getElementById("endpoint"),
  endpointActions: document.getElementById("endpoint-actions"),
  message: document.getElementById("message"),
  addButton: document.getElementById("add-button"),
  removeButton: document.getElementById("remove-button"),
  allowEndpointButton: document.getElementById("allow-endpoint-button"),
  blockEndpointButton: document.getElementById("block-endpoint-button"),
  form: document.getElementById("password-form"),
  label: document.getElementById("password-label"),
  input: document.getElementById("password-input"),
  toggleButton: document.getElementById("toggle-password-button"),
  submitButton: document.getElementById("submit-button")
};

let activeTab = null;
let activeSiteKey = null;
let activeEndpointKey = null;
let activeBlockState = null;
let blockedSites = {};
let formMode = null;
let passwordInput = null;

function createManualPasswordInput(input, toggleButton, messageElement) {
  const state = { value: "", visible: false };
  const maskCharacter = "•";
  const blockedEvents = ["paste", "drop", "contextmenu", "copy", "cut"];

  function render(selectionStart = state.value.length, selectionEnd = selectionStart) {
    input.value = state.visible ? state.value : maskCharacter.repeat(state.value.length);

    try {
      input.setSelectionRange(selectionStart, selectionEnd);
    } catch (error) {
      // Some browsers can reject selection changes while the popup is closing.
    }
  }

  function setVisible(visible) {
    state.visible = visible;
    toggleButton.setAttribute("aria-pressed", String(visible));
    toggleButton.setAttribute("aria-label", visible ? "Скрыть пароль" : "Показать пароль");
    toggleButton.title = visible ? "Скрыть пароль" : "Показать пароль";
    render(input.selectionStart || state.value.length, input.selectionEnd || state.value.length);
    input.focus();
  }

  function replaceSelection(text) {
    const start = input.selectionStart ?? state.value.length;
    const end = input.selectionEnd ?? start;

    state.value = state.value.slice(0, start) + text + state.value.slice(end);
    render(start + text.length);
  }

  function removeSelection(direction) {
    const start = input.selectionStart ?? state.value.length;
    const end = input.selectionEnd ?? start;

    if (start !== end) {
      state.value = state.value.slice(0, start) + state.value.slice(end);
      render(start);
      return;
    }

    if (direction === "backward" && start > 0) {
      state.value = state.value.slice(0, start - 1) + state.value.slice(start);
      render(start - 1);
    }

    if (direction === "forward" && start < state.value.length) {
      state.value = state.value.slice(0, start) + state.value.slice(start + 1);
      render(start);
    }
  }

  function rejectAutomaticInput(event) {
    event.preventDefault();
    messageElement.textContent = "Пароль нужно ввести вручную.";
    render();
  }

  input.type = "text";
  input.name = "pagelock-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now());
  input.autocomplete = "one-time-code";
  input.inputMode = "text";
  input.setAttribute("aria-autocomplete", "none");
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("autocorrect", "off");
  input.spellcheck = false;
  input.setAttribute("data-lpignore", "true");
  input.setAttribute("data-1p-ignore", "true");
  input.setAttribute("data-bwignore", "true");
  input.setAttribute("data-form-type", "other");
  input.setAttribute("readonly", "readonly");

  input.addEventListener("pointerdown", () => {
    input.removeAttribute("readonly");
  });

  input.addEventListener("focus", () => {
    input.removeAttribute("readonly");
    render(input.selectionStart || state.value.length, input.selectionEnd || state.value.length);
  });

  for (const eventName of blockedEvents) {
    input.addEventListener(eventName, rejectAutomaticInput);
  }

  input.addEventListener("beforeinput", (event) => {
    if (event.inputType === "insertText" && typeof event.data === "string") {
      event.preventDefault();
      replaceSelection(event.data);
      return;
    }

    if (event.inputType === "deleteContentBackward") {
      event.preventDefault();
      removeSelection("backward");
      return;
    }

    if (event.inputType === "deleteContentForward") {
      event.preventDefault();
      removeSelection("forward");
      return;
    }

    if (event.inputType && event.inputType !== "historyUndo" && event.inputType !== "historyRedo") {
      rejectAutomaticInput(event);
    }
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      removeSelection("backward");
      return;
    }

    if (event.key === "Delete") {
      event.preventDefault();
      removeSelection("forward");
      return;
    }

    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      replaceSelection(event.key);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
      rejectAutomaticInput(event);
    }
  });

  input.addEventListener("input", () => render());
  input.addEventListener("change", () => render());
  toggleButton.addEventListener("click", () => setVisible(!state.visible));

  const scrubTimer = setInterval(() => {
    if (!input.isConnected) {
      clearInterval(scrubTimer);
      return;
    }

    const expectedValue = state.visible ? state.value : maskCharacter.repeat(state.value.length);

    if (input.value !== expectedValue) {
      render(Math.min(input.selectionStart || state.value.length, state.value.length));
    }
  }, 250);

  return {
    clear() {
      state.value = "";
      state.visible = false;
      toggleButton.setAttribute("aria-pressed", "false");
      toggleButton.setAttribute("aria-label", "Показать пароль");
      toggleButton.title = "Показать пароль";
      render(0);
    },
    focus() {
      input.removeAttribute("readonly");
      input.focus();
    },
    getValue() {
      return state.value;
    }
  };
}

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
  activeEndpointKey = PageLockSite.getEndpointKeyFromUrl(activeTab.url);

  if (!activeSiteKey) {
    elements.site.textContent = "Эту страницу нельзя заблокировать.";
    elements.addButton.disabled = true;
    elements.removeButton.disabled = true;
    return;
  }

  const result = await api.storage.local.get({ blockedSites: {} });
  blockedSites = result.blockedSites;
  activeBlockState = PageLockSite.getBlockStateFromUrl(activeTab.url, blockedSites);
  renderState();
}

function renderState() {
  const isBlocked = Boolean(activeBlockState);
  const isEndpointAllowed = Boolean(activeBlockState && activeBlockState.isEndpointAllowed);

  elements.site.textContent = activeSiteKey;
  elements.endpoint.textContent = activeEndpointKey ? "Страница: " + activeEndpointKey : "";

  if (!isBlocked) {
    elements.status.textContent = "Сайт не заблокирован.";
  } else if (isEndpointAllowed) {
    elements.status.textContent = "Домен " + activeBlockState.siteKey + " заблокирован, но эта страница в исключениях.";
  } else {
    elements.status.textContent = "Домен " + activeBlockState.siteKey + " в черном списке.";
  }

  elements.addButton.disabled = isBlocked;
  elements.removeButton.disabled = !isBlocked;
  elements.endpointActions.hidden = !isBlocked;
  elements.allowEndpointButton.hidden = !isBlocked || isEndpointAllowed;
  elements.blockEndpointButton.hidden = !isBlocked || !isEndpointAllowed;
  elements.allowEndpointButton.disabled = !activeEndpointKey;
  elements.blockEndpointButton.disabled = !activeEndpointKey;
}

function showForm(mode) {
  formMode = mode;
  elements.form.hidden = false;
  passwordInput.clear();
  elements.message.textContent = "";

  if (mode === "add") {
    elements.label.textContent = "Новый код PageLock для сайта";
    elements.submitButton.textContent = "Добавить";
  } else if (mode === "allowEndpoint") {
    elements.label.textContent = "Код PageLock для исключения страницы";
    elements.submitButton.textContent = "Разблокировать страницу";
  } else {
    elements.label.textContent = "Код PageLock для удаления сайта";
    elements.submitButton.textContent = "Удалить";
  }

  passwordInput.focus();
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
  record.allowedEndpoints = [];
  blockedSites[activeSiteKey] = record;
  await api.storage.local.set({ blockedSites });
  elements.message.textContent = "Сайт добавлен в черный список.";
  await notifyActiveTab({ type: "PAGELOCK_RECHECK" });
  return true;
}

async function removeSite(password) {
  const blockState = PageLockSite.getBlockStateFromUrl(activeTab.url, blockedSites);

  if (!blockState) {
    elements.message.textContent = "Сайт уже не заблокирован.";
    return false;
  }

  const record = blockState.record;
  const isPasswordValid = await PageLockCrypto.verifyPassword(password, record);

  if (!isPasswordValid) {
    elements.message.textContent = "Неверный код PageLock.";
    passwordInput.clear();
    passwordInput.focus();
    return false;
  }

  delete blockedSites[blockState.siteKey];
  await api.storage.local.set({ blockedSites });
  elements.message.textContent = "Сайт удален из черного списка.";
  await notifyActiveTab({
    type: "PAGELOCK_REMOVE_OVERLAY",
    siteKey: blockState.siteKey
  });
  return true;
}

async function allowCurrentEndpoint(password) {
  const blockState = PageLockSite.getBlockStateFromUrl(activeTab.url, blockedSites);

  if (!blockState) {
    elements.message.textContent = "Сначала добавь сайт в черный список.";
    return false;
  }

  const isPasswordValid = await PageLockCrypto.verifyPassword(password, blockState.record);

  if (!isPasswordValid) {
    elements.message.textContent = "Неверный код PageLock.";
    passwordInput.clear();
    passwordInput.focus();
    return false;
  }

  const allowedEndpoints = PageLockSite.getAllowedEndpoints(blockState.record);

  if (!allowedEndpoints.includes(activeEndpointKey)) {
    blockedSites[blockState.siteKey] = {
      ...blockState.record,
      allowedEndpoints: [...allowedEndpoints, activeEndpointKey]
    };
    await api.storage.local.set({ blockedSites });
  }

  elements.message.textContent = "Эта страница разблокирована навсегда.";
  await notifyActiveTab({ type: "PAGELOCK_RECHECK" });
  return true;
}

async function blockCurrentEndpoint() {
  elements.form.hidden = true;
  passwordInput.clear();

  const blockState = PageLockSite.getBlockStateFromUrl(activeTab.url, blockedSites);

  if (!blockState) {
    elements.message.textContent = "Сайт не заблокирован.";
    return;
  }

  const allowedEndpoints = PageLockSite
    .getAllowedEndpoints(blockState.record)
    .filter((endpointKey) => endpointKey !== activeEndpointKey);

  blockedSites[blockState.siteKey] = {
    ...blockState.record,
    allowedEndpoints
  };

  await api.storage.local.set({ blockedSites });
  elements.message.textContent = "Страница снова будет блокироваться.";
  await notifyActiveTab({ type: "PAGELOCK_RECHECK" });
  await loadState();
}

elements.addButton.addEventListener("click", () => showForm("add"));
elements.removeButton.addEventListener("click", () => showForm("remove"));
elements.allowEndpointButton.addEventListener("click", () => showForm("allowEndpoint"));
elements.blockEndpointButton.addEventListener("click", blockCurrentEndpoint);

async function submitPassword() {
  const password = passwordInput.getValue();

  if (!password) {
    elements.message.textContent = "Введите пароль.";
    passwordInput.focus();
    return;
  }

  elements.submitButton.disabled = true;

  try {
    let didComplete = false;

    if (formMode === "add") {
      didComplete = await addSite(password);
    } else if (formMode === "allowEndpoint") {
      didComplete = await allowCurrentEndpoint(password);
    } else {
      didComplete = await removeSite(password);
    }

    if (didComplete) {
      elements.form.hidden = true;
      await loadState();
    }
  } finally {
    elements.submitButton.disabled = false;
  }
}

elements.submitButton.addEventListener("click", submitPassword);

elements.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitPassword();
  }
});

passwordInput = createManualPasswordInput(elements.input, elements.toggleButton, elements.message);
loadState();
