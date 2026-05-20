(function () {
  // Приводит домен к одному виду, чтобы www.example.com и example.com считались одним сайтом.
  function normalizeHostname(hostname) {
    return hostname.toLowerCase().replace(/^www\./, "");
  }

  // Приводит путь страницы к стабильному виду для endpoint-исключений.
  function normalizePathname(pathname) {
    const path = pathname || "/";
    const normalizedPath = path.replace(/\/+/g, "/");

    if (normalizedPath === "/") {
      return "/";
    }

    return normalizedPath.replace(/\/+$/g, "");
  }

  // PageLock работает только с обычными http/https страницами, не с about:/moz-extension:/file:.
  function isSupportedUrl(url) {
    return url.protocol === "http:" || url.protocol === "https:";
  }

  // Возвращает ключ сайта для хранения в черном списке: только домен без пути.
  function getSiteKeyFromUrl(rawUrl) {
    const url = new URL(rawUrl);

    if (!isSupportedUrl(url)) {
      return null;
    }

    return normalizeHostname(url.hostname);
  }

  // Возвращает ключ конкретной страницы: домен + путь, без query и hash.
  function getEndpointKeyFromUrl(rawUrl) {
    const url = new URL(rawUrl);

    if (!isSupportedUrl(url)) {
      return null;
    }

    return normalizeHostname(url.hostname) + normalizePathname(url.pathname);
  }

  // Ищет заблокированный домен, включая поддомены: clips.twitch.tv попадает под twitch.tv.
  function findBlockedSite(hostname, blockedSites) {
    const siteKey = normalizeHostname(hostname);
    const entries = Object.entries(blockedSites || {});

    for (const [blockedSiteKey, record] of entries) {
      if (siteKey === blockedSiteKey || siteKey.endsWith("." + blockedSiteKey)) {
        return { siteKey: blockedSiteKey, record };
      }
    }

    return null;
  }

  // Безопасно достает список страниц-исключений даже из старых записей без этого поля.
  function getAllowedEndpoints(record) {
    return Array.isArray(record && record.allowedEndpoints) ? record.allowedEndpoints : [];
  }

  // Проверяет, разрешена ли конкретная страница внутри заблокированного домена.
  function isEndpointAllowed(record, endpointKey) {
    return getAllowedEndpoints(record).includes(endpointKey);
  }

  // Собирает всю информацию о блокировке текущего URL в один объект для popup/content.
  function getBlockStateFromUrl(rawUrl, blockedSites) {
    const url = new URL(rawUrl);

    if (!isSupportedUrl(url)) {
      return null;
    }

    const blockedSite = findBlockedSite(url.hostname, blockedSites);

    if (!blockedSite) {
      return null;
    }

    const endpointKey = getEndpointKeyFromUrl(rawUrl);

    return {
      siteKey: blockedSite.siteKey,
      record: blockedSite.record,
      endpointKey,
      isEndpointAllowed: isEndpointAllowed(blockedSite.record, endpointKey)
    };
  }

  // Экспортируем helpers в globalThis, потому что файлы подключаются как обычные scripts.
  globalThis.PageLockSite = {
    findBlockedSite,
    getAllowedEndpoints,
    getBlockStateFromUrl,
    getEndpointKeyFromUrl,
    getSiteKeyFromUrl,
    isEndpointAllowed,
    normalizeHostname,
    normalizePathname
  };
})();
