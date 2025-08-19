import { createApp } from 'vue'
import App from './App.vue'

// Vuetify
import 'vuetify/styles'                     // CSS base Vuetify
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

// Icone MDI
import '@mdi/font/css/materialdesignicons.css'

const vuetify = createVuetify({
  components,
  directives,
  // (opzionale) icons: { defaultSet: 'mdi' }
})

createApp(App).use(vuetify).mount('#app')
