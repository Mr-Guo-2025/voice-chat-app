const CACHE_NAME = "chat-app-v2"; // 版本號更新，強制更新快取
const ASSETS = ["/", "/index.html", "/icon.png", "/socket.io/socket.io.js"];

// 安裝 Service Worker
self.addEventListener("install", (event) => {
  self.skipWaiting(); // 強制立即啟用新的 Service Worker
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// 啟用 Service Worker
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key); // 刪除舊版本的快取
          }
        })
      );
    })
  );
  self.clients.claim(); // 立即接管所有頁面
});

// 攔截請求 (改為 Network First: 先問網路，沒網路才用快取)
self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 如果網路請求成功，順便更新快取
        if (event.request.method === "GET" && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // 沒網路時，回傳快取的內容
        return caches.match(event.request);
      })
  );
});

// 監聽 Push 事件
self.addEventListener("push", (event) => {
  const data = event.data.json();
  console.log("Push Received...", data);
  self.registration.showNotification(data.title, {
    body: data.body,
    icon: "/icon.png", // 確保有這個圖示
    data: { url: data.url },
  });
});

// 監聽通知點擊
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((clientList) => {
      // 如果已經打開，就聚焦
      for (const client of clientList) {
        if (
          client.url.includes(event.notification.data.url) &&
          "focus" in client
        )
          return client.focus();
      }
      // 否則打開新視窗
      if (clients.openWindow)
        return clients.openWindow(event.notification.data.url);
    })
  );
});
