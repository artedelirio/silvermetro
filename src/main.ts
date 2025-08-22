import { createApp } from 'vue'
import App from './App.vue'
import { StatusBar, Style } from '@capacitor/status-bar';

// Vuetify
import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { Device } from '@capacitor/device';
import { Capacitor } from '@capacitor/core';

// Icone MDI
import '@mdi/font/css/materialdesignicons.css'

const vuetify = createVuetify({ components, directives })

createApp(App).use(vuetify).mount('#app')

// ✅ Configura la status bar solo su Android >= 15
async function configureStatusBar() {
  if (Capacitor.getPlatform() === 'android') {
    const info = await Device.getInfo();
    const androidVersion = parseInt(info.osVersion.split('.')[0]);
    if (androidVersion >= 15) {
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setBackgroundColor({ color: '#CACACA' });
      await StatusBar.setStyle({ style: Style.Dark });
    }
  }
}
configureStatusBar();