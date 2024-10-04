const CACHE_NAME = 'wordle-upgrade-cache-v2'; // Updated cache version
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/words_en.txt',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32x32.png',
  '/icons/favicon-16x16.png',
  '/manifest.json',
  '/pop-sound.mp3', // Ensure this path is correct
  // Add other assets like images, icons, etc.
];

// Install the service worker and cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Fetch assets from cache or network
self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('api.dictionaryapi.dev')) {
    // Don't cache API responses
    return;
  }
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response; // Return from cache
        }
        return fetch(event.request); // Fetch from network
      })
  );
});

// Update the service worker
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (!cacheWhitelist.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});
