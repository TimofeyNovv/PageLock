(function () {
  function normalizeHostname(hostname) {
    return hostname.toLowerCase().replace(/^www\./, "");
  }

  function normalizePathname(pathname) {
    const path = pathname || "/";
    const normalizedPath = path.replace(/\/+/g, "/");

    if (normalizedPath === "/") {
      return "/";
    }

    return normalizedPath.replace(/\/+$/g, "");
  }

  function isSupportedUrl(url) {
    return url.protocol === "http:" || url.protocol === "https:";
  }

  function getSiteKeyFromUrl(rawUrl) {
    const url = new URL(rawUrl);

    if (!isSupportedUrl(url)) {
      return null;
    }

    return normalizeHostname(url.hostname);
  }

  function getEndpointKeyFromUrl(rawUrl) {
    const url = new URL(rawUrl);

    if (!isSupportedUrl(url)) {
      return null;
    }

    return normalizeHostname(url.hostname) + normalizePathname(url.pathname);
  }

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

  function getAllowedEndpoints(record) {
    return Array.isArray(record && record.allowedEndpoints) ? record.allowedEndpoints : [];
  }

  function isEndpointAllowed(record, endpointKey) {
    return getAllowedEndpoints(record).includes(endpointKey);
  }

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
