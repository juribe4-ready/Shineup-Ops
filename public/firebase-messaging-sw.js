importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDfVyUh8ZOjW2hpvVpNwlnsvl_mcBRGKh8",
  authDomain: "shineup-c574a.firebaseapp.com",
  projectId: "shineup-c574a",
  storageBucket: "shineup-c574a.firebasestorage.app",
  messagingSenderId: "119206466115",
  appId: "1:119206466115:web:c2b5ddbf921523bc5fbaf6"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const { title, body, cleaningId } = payload.data || {};
  self.registration.showNotification(title || 'ShineUP', {
    body: body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { cleaningId },
    vibrate: [200, 100, 200],
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const cleaningId = event.notification.data?.cleaningId;
  const url = cleaningId
    ? `https://shineup-ops.vercel.app/?cleaning=${cleaningId}`
    : 'https://shineup-ops.vercel.app/';
  event.waitUntil(clients.openWindow(url));
});
