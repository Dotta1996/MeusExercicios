import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.meusexercicios.app',
  appName: 'Meus Exercícios',
  webDir: 'dist',
  plugins: {
    LocalNotifications: {
      // Ícone dedicado pra barra de status (silhueta branca, sem o fundo do
      // logo) — o launcher icon colorido não funciona ali, o Android renderiza
      // só o canal alfa dele, o que ficava um quadrado branco sem forma.
      smallIcon: 'ic_stat_notify'
    }
  }
};

export default config;
