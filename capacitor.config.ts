// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.example.silverclick',
  appName: 'SilverClick',
  webDir: 'dist',
  plugins: {
  EdgeToEdge: {
      backgroundColor: "#4d6db3ff", // Cambia il colore di sfondo della status bar
    },
  },
  android: {
    backgroundColor: '#ffffffff'  // colore di fondo dell’Activity/WebView
  },
  bundledWebRuntime: false,
}

export default config
