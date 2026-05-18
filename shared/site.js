(function () {
  function normalizeHostname(hostname) {
    return hostname.toLowerCase().replace(/^www\./, "");
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

  function findBlockedSite(hostname, blockedSites) {
    const siteKey = normalizeHostname(hostname);
    const entries = Object.entries(blockedSites || {});

    for (const [blockedSiteKey, record] of entries) {
      if (siteKey === blockedSiteKey || siteKey.endsWith(`.${blockedSiteKey}`)) {
        return { siteKey: blockedSiteKey, record };
      }
    }

    return null;
  }

  globalThis.PageLockSite = {
    findBlockedSite,
    getSiteKeyFromUrl,
    normalizeHostname
  };
})();
