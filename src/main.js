import { createApp } from 'vue';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';
import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import './style.css';
import App from './App.vue';
createApp(App).use(createVuetify({ components, directives, theme: { defaultTheme: 'wall', themes: { wall: { dark: true, colors: { background: '#101617', surface: '#1a2223', primary: '#b9df8a', secondary: '#92c8bf', error: '#f5a19d' } } } }, defaults: { VBtn: { rounded: 'lg', style: 'text-transform:none;letter-spacing:0' }, VTextField: { variant: 'outlined', density: 'comfortable' }, VSelect: { variant: 'outlined', density: 'comfortable' }, VCard: { rounded: 'xl' } } })).mount('#app');
