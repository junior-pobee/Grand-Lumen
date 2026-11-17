# Grand-Lumen Email Connection Setup

Grand-Lumen Mails sends messages through the signed-in user's connected Gmail or Outlook account. The app does not collect email passwords and does not read inbox contents.

## 1. Supabase identity linking

1. Open the Supabase project used by Grand-Lumen.
2. Go to Authentication settings and enable manual identity linking.
3. In Authentication > URL Configuration, add the deployed Grand-Lumen URL to the allowed redirect URLs:
   `https://junior-pobee.github.io/Grand-Lumen/`
4. Keep the Supabase project callback URL available for the OAuth applications:
   `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

Manual identity linking is required because a user connects an email provider to an existing Grand-Lumen account.

## 2. Google Gmail

1. Create a Web OAuth client in Google Cloud for Grand-Lumen.
2. Configure the Supabase callback URL above as an authorized redirect URI.
3. Configure the OAuth consent screen and request the Gmail sending scope:
   `https://www.googleapis.com/auth/gmail.send`
4. In Supabase Authentication > Providers > Google, enable Google and enter the OAuth client ID and client secret.
5. Save the provider settings.

Google may require consent-screen configuration and app verification before broad public use of Gmail scopes.

## 3. Microsoft Outlook

1. Register a web application in Microsoft Entra.
2. Add the Supabase callback URL above as a Web redirect URI.
3. Add the delegated Microsoft Graph permission `Mail.Send`.
4. Enable the Microsoft identity provider in Supabase Authentication > Providers > Azure.
5. Enter the application client ID and client secret in Supabase. Configure the tenant setting appropriate for the intended audience.
6. Save the provider settings.

The app requests the `Mail.Send` delegated permission and `offline_access` during authorization.

## 4. Deployment and security

- Never place Google or Microsoft client secrets in the Vite frontend, GitHub repository, or public environment variables.
- Keep OAuth client secrets in the Supabase provider configuration.
- Use HTTPS for the deployed app and restrict OAuth redirect URLs to the actual Grand-Lumen domains.
- Provider access tokens are short-lived and kept in the current browser tab session. Users may need to reconnect or re-authorize after the permission expires.
- The current Mails feature sends outbound email only. It does not provide inbox reading, incoming mail sync, attachments, or a sent-mail browser.
- A successful send response means the provider accepted the message for delivery; it does not guarantee that the recipient's mail server delivered it to the inbox.

## 5. First test

After configuring both providers, sign in to Grand-Lumen with its normal account, open Mails, connect Gmail or Outlook, and send a test message to an address you control.
