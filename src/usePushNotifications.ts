import { useEffect } from 'react'
import { initializeApp, getApps } from 'firebase/app'
import { getMessaging, getToken, onMessage } from 'firebase/messaging'
import { supabase } from './AuthContext'

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDfVyUh8ZOjW2hpvVpNwlnsvl_mcBRGKh8",
  authDomain: "shineup-c574a.firebaseapp.com",
  projectId: "shineup-c574a",
  storageBucket: "shineup-c574a.firebasestorage.app",
  messagingSenderId: "119206466115",
  appId: "1:119206466115:web:c2b5ddbf921523bc5fbaf6"
}

const VAPID_KEY = "BIp9oAMDPwcTUf73eZD1mQO-6Wmz9VU8LFg-mhS7nuD2e7TQyhMwsUg1EicQl_yRFY_NrmvLP2sdcxVy0OLxbQk"

export function usePushNotifications(userId: string | undefined) {
  useEffect(() => {
    if (!userId || !('serviceWorker' in navigator) || !('Notification' in window)) return

    const setup = async () => {
      try {
        // Register service worker
        const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js')

        // Request permission
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return

        // Init Firebase
        const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApps()[0]
        const messaging = getMessaging(app)

        // Get token
        const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg })
        if (!token) return

        // Save token to Supabase
        const { data: session } = await supabase.auth.getSession()
        if (!session.session) return

        await fetch('/api/savePushToken', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.session.access_token}`
          },
          body: JSON.stringify({ token, device: navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop' })
        })

        // Handle foreground messages
        onMessage(messaging, payload => {
          const { title, body } = payload.data || {}
          if (title && 'Notification' in window) {
            new Notification(title, { body, icon: '/icon-192.png' })
          }
        })

      } catch (err) {
        console.error('[Push] Error:', err)
      }
    }

    setup()
  }, [userId])
}
