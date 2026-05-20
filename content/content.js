(function () {
  // Не блокируем iframe: overlay нужен только для основной страницы вкладки.
  if (window.top !== window) {
    return;
  }

  const api = globalThis.PageLockApi;
  // activeLock нужен, чтобы знать, какой overlay сейчас показан и можно ли его убрать.
  let activeLock = null;

  // Убирает экран блокировки и возвращает прокрутку странице.
  function removeOverlay() {
    const overlay = document.getElementById("pagelock-overlay");

    if (overlay) {
      overlay.remove();
    }

    document.documentElement.classList.remove("pagelock-locked");
    activeLock = null;
  }

  // Добавляет overlay как можно раньше: body может еще не существовать на document_start.
  function appendOverlay(overlay) {
    const parent = document.body || document.documentElement;
    parent.appendChild(overlay);
  }

  // Контролируемое поле кода: реальный ввод хранится в JS, а не в input.value.
  function createManualPasswordInput(input, toggleButton, error) {
    const state = { value: "", visible: false };
    const maskCharacter = "•";
    const blockedEvents = ["paste", "drop", "contextmenu", "copy", "cut"];

    // Перерисовывает поле: либо показывает код, либо заменяет его точками.
    function render(selectionStart = state.value.length, selectionEnd = selectionStart) {
      input.value = state.visible ? state.value : maskCharacter.repeat(state.value.length);

      try {
        input.setSelectionRange(selectionStart, selectionEnd);
      } catch (error) {
        // The element can disappear while a tab is navigating.
      }
    }

    // Переключает глазок между видимым кодом и скрытым режимом.
    function setVisible(visible) {
      state.visible = visible;
      toggleButton.setAttribute("aria-pressed", String(visible));
      toggleButton.setAttribute("aria-label", visible ? "Скрыть пароль" : "Показать пароль");
      toggleButton.title = visible ? "Скрыть пароль" : "Показать пароль";
      render(input.selectionStart || state.value.length, input.selectionEnd || state.value.length);
      input.focus();
    }

    // Вставляет вручную набранные символы в наше JS-состояние с учетом выделения.
    function replaceSelection(text) {
      const start = input.selectionStart ?? state.value.length;
      const end = input.selectionEnd ?? start;

      state.value = state.value.slice(0, start) + text + state.value.slice(end);
      render(start + text.length);
    }

    // Удаляет символы из JS-состояния, а не из DOM-значения поля.
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

    // Отсекает вставку, drag-and-drop и попытки внешнего автозаполнения.
    function rejectAutomaticInput(event) {
      event.preventDefault();
      error.textContent = "Пароль нужно ввести вручную.";
      render();
    }

    // Это text-поле, чтобы Firefox не распознавал его как пароль от текущего сайта.
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

    // Если менеджер паролей все же запишет что-то в DOM, возвращаем отображение к нашему состоянию.
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

  // Проверяет код на экране блокировки и временно разблокирует домен в этой вкладке.
  async function submitPassword(passwordInput, button, error, siteKey, record) {
    const password = passwordInput.getValue();

    if (!password) {
      error.textContent = "Введите пароль.";
      passwordInput.focus();
      return;
    }

    button.disabled = true;
    error.textContent = "";

    const isPasswordValid = await PageLockCrypto.verifyPassword(password, record);

    if (!isPasswordValid) {
      error.textContent = "Неверный пароль.";
      passwordInput.clear();
      passwordInput.focus();
      button.disabled = false;
      return;
    }

    await api.runtime.sendMessage({
      type: "PAGELOCK_UNLOCK_TAB",
      siteKey
    });

    removeOverlay();
  }

  // Создает полноэкранный UI блокировки поверх сайта.
  function createLockScreen(siteKey, record) {
    removeOverlay();
    activeLock = { siteKey, record };
    document.documentElement.classList.add("pagelock-locked");

    const overlay = document.createElement("div");
    overlay.id = "pagelock-overlay";

    const panel = document.createElement("div");
    panel.id = "pagelock-panel";

    const title = document.createElement("h1");
    title.textContent = "PageLock";

    const text = document.createElement("p");
    text.textContent = `Сайт ${siteKey} заблокирован. Введи пароль, чтобы открыть его в этой вкладке.`;

    const inputId = "pagelock-code-" + (crypto.randomUUID ? crypto.randomUUID() : Date.now());

    const label = document.createElement("label");
    label.htmlFor = inputId;
    label.textContent = "Код PageLock";

    const passwordRow = document.createElement("div");
    passwordRow.id = "pagelock-password-row";

    const input = document.createElement("input");
    input.id = inputId;
    input.type = "text";
    input.autocomplete = "one-time-code";
    input.autocapitalize = "off";
    input.spellcheck = false;
    input.readOnly = true;
    input.setAttribute("aria-required", "true");
    input.setAttribute("data-lpignore", "true");
    input.setAttribute("data-1p-ignore", "true");
    input.setAttribute("data-bwignore", "true");

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "pagelock-password-toggle";
    toggleButton.setAttribute("aria-label", "Показать пароль");
    toggleButton.setAttribute("aria-pressed", "false");
    toggleButton.title = "Показать пароль";
    toggleButton.innerHTML = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/><circle cx=\"12\" cy=\"12\" r=\"3\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"/></svg>";
    passwordRow.append(input, toggleButton);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Разблокировать";

    const error = document.createElement("div");
    error.id = "pagelock-error";
    error.setAttribute("aria-live", "polite");

    panel.append(title, text, label, passwordRow, button, error);
    overlay.appendChild(panel);

    const passwordInput = createManualPasswordInput(input, toggleButton, error);

    button.addEventListener("click", () => {
      submitPassword(passwordInput, button, error, siteKey, record);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        submitPassword(passwordInput, button, error, siteKey, record);
      }
    });

    appendOverlay(overlay);
    passwordInput.focus();
  }

  // Главная проверка страницы: заблокирована ли она и не является ли endpoint исключением.
  async function checkCurrentPage() {
    const url = new URL(location.href);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return;
    }

    const result = await api.storage.local.get({ blockedSites: {} });
    const blockState = PageLockSite.getBlockStateFromUrl(location.href, result.blockedSites);

    if (!blockState || blockState.isEndpointAllowed) {
      removeOverlay();
      return;
    }

    const unlockState = await api.runtime.sendMessage({
      type: "PAGELOCK_IS_UNLOCKED",
      siteKey: blockState.siteKey
    });

    if (!unlockState.unlocked) {
      createLockScreen(blockState.siteKey, blockState.record);
    }
  }

  // Popup просит content script перепроверить страницу после изменений в storage.
  api.runtime.onMessage.addListener((message) => {
    if (message.type === "PAGELOCK_RECHECK") {
      checkCurrentPage();
    }

    if (message.type === "PAGELOCK_REMOVE_OVERLAY" && activeLock && activeLock.siteKey === message.siteKey) {
      removeOverlay();
    }
  });

  checkCurrentPage();
})();
