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
  toggleButton: document.getElementById("toggle-password-button"),
  submitButton: document.getElementById("submit-button")
};

let activeTab = null;
let activeSiteKey = null;
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
  passwordInput.clear();
  elements.message.textContent = "";

  if (mode === "add") {
    elements.label.textContent = "Новый код PageLock для сайта";
    elements.submitButton.textContent = "Добавить";
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
    passwordInput.clear();
    passwordInput.focus();
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

async function submitPassword() {
  const password = passwordInput.getValue();

  if (!password) {
    elements.message.textContent = "Введите пароль.";
    passwordInput.focus();
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
