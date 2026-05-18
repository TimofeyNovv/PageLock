(function () {
  const api = globalThis.browser || globalThis.chrome;

  if (!api) {
    throw new Error("PageLock cannot find the WebExtensions API.");
  }

  globalThis.PageLockApi = api;
})();
