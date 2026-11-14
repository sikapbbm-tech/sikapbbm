import type { Metadata, Viewport } from 'next'
import './globals.css'
import RegisterSW from '@/components/RegisterSW'

export const metadata: Metadata = {
  title: { default: 'SIKAP BBM Sumba Barat', template: '%s | SIKAP BBM' },
  description: 'Sistem Informasi Kendali dan Pengawasan BBM - Pemerintah Kabupaten Sumba Barat',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon-192.png', apple: '/icon-192.png' },
  robots: { index: false, follow: false },
}

export const viewport: Viewport = { themeColor: '#0f7a3d', width: 'device-width', initialScale: 1 }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  )
}
