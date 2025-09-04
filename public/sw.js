// public/sw.js — minimal PWA bootstrap
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Keep it simple: no caching yet (avoids stale builds while you iterate)
self.addEventListener("fetch", () => {});
