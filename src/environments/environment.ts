export const environment = {
  gasUrl: 'https://script.google.com/macros/s/AKfycbyQRX7qS5cpjZmQCEAmDLy9SW5xKvdeK59IfQ8AnshFLbfaeFCppaTXlT3M3aRbRKJJ/exec',
  oauthClientId: '_R5GUNGYX1hmC4gasYlVTfKmCpi9Rfu2UXS1zNUPiY0',            // Set to your OAUTH_UID for local dev testing
  // oauthRedirectUri: 'https://browserstack-events.github.io/StackConnect-App/auth-callback.html'
  oauthRedirectUri: 'https://probable-journey-974999pr459g3x4pw-36493.app.github.dev/auth-callback.html',  // Set to your local redirect URI for local dev testing
  // Email whitelist for SPOC access — allows these emails in addition to BrowserStack employees (group_id === 2)
  spocEmailWhitelist: ['varun.s@browserstack.com']  // Add emails as strings: ['user@example.com', 'other@example.com']
};