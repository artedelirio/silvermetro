// main.ts
import { createApp } from 'vue'
import App from './App.vue'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Capacitor } from '@capacitor/core'

// Vuetify
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import '@mdi/font/css/materialdesignicons.css'

const vuetify = createVuetify({ components, directives });

(async () => {
  if (Capacitor.getPlatform() === 'android') {
    try {
      // Importantissimo: farlo PRIMA del mount
      await StatusBar.setOverlaysWebView({ overlay: false })
      await StatusBar.setBackgroundColor({ color: '#000000' }) // colore pieno, non trasparente
      await StatusBar.setStyle({ style: Style.Light })         // icone chiare su sfondo scuro
      await StatusBar.show()                                   // forza applicazione su alcuni OEM
    } catch (e) {
      console.warn('StatusBar init:', e)
    }
  }

  createApp(App).use(vuetify).mount('#app')
})()
