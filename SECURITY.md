# Security Guide

This project now ships with a safer default posture for the hosted web app:

- Supabase magic-link authentication with an explicit email allowlist
- PKCE-based auth flow for browser sign-in
- security headers on Vercel responses
- session-only web signature storage by default
- no secrets committed to the repository
- CI and dependency update automation

## Current security model

### Web app

- Access is controlled inside the app with Supabase Auth.
- Only emails listed in `VITE_ALLOWED_EMAILS` can sign in.
- Saved signatures are **not persisted** in the browser by default.
- Templates, fill profiles, and export history remain browser-local per signed-in email.

### Desktop app

- The Tauri build remains the recommended path for persistent local signature storage.
- Signature assets can be stored on-device through the native runtime instead of the browser.

## Environment variables

Frontend-safe variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_ALLOWED_EMAILS`
- `VITE_WEB_SIGNATURE_PERSISTENCE=false`

Example allowlist:

- `VITE_ALLOWED_EMAILS=first-approved@yourcompany.com,second-approved@yourcompany.com`

Never put a Supabase `service_role` key in Vercel or in client-side code.

## Required external settings

### GitHub

- Enable 2FA on the GitHub account that owns the repository.
- Keep the repository private unless there is a deliberate reason to open it.
- Add branch protection on `main`:
  - require pull request review
  - require status checks to pass
  - restrict force pushes

### Vercel

- Enable 2FA on the Vercel account.
- Keep secrets only in `Project Settings -> Environment Variables`.
- Review deployed domains and remove unused preview/custom domains.
- If you need network-level protection in front of the app, add Vercel Deployment Protection or Firewall rules in addition to the in-app login.

### Supabase

- Keep `Site URL` and redirect allowlists tight.
- Use only the domains you actually need:
  - `https://opsedit.online`
  - `http://localhost:3000/**`
  - `https://*-<your-vercel-account>.vercel.app/**`
- Keep Email auth enabled only if you are actively using it.
- Review Auth rate limits and email template settings before broader rollout.

## Recommended next step for stronger data security

If saved signatures must survive page refreshes in the hosted web app, do not move them back into browser persistence.

Instead:

1. store signature images in a **private** Supabase Storage bucket
2. store metadata in Postgres
3. enforce Row Level Security so each user can access only their own data

That is the right path if this app becomes multi-device or multi-user.
