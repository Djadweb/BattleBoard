import '../styles/globals.css';
import { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import InstallPrompt from '../components/PWA/InstallPrompt';
import PWARegister from '../components/PWA/PWARegister';

export const metadata: Metadata = {
  title: 'Project Board',
  description: 'Visual project tracker dashboard',
  applicationName: 'Project Board',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }
    ],
    apple: [
      { url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }
    ],
    shortcut: ['/favicon.svg']
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Project Board'
  },
  other: {
    'mobile-web-app-capable': 'yes'
  }
};

export const viewport: Viewport = {
  themeColor: '#0b0c0e'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PWARegister />
        <InstallPrompt />
        {children}
      </body>
    </html>
  );
}
