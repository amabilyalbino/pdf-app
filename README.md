# Ops PDF Studio

Ops PDF Studio is a lightweight PDF filling and signature app built for operations workflows.

It lets one user:

- import a PDF
- place text, date, checkbox, and signature fields visually
- reuse saved signatures
- save document templates for recurring forms
- export a new filled PDF without overwriting the original

## Current product shape

This project can run in two modes:

- `Web app`: easiest way to share and test online
- `Desktop app`: Tauri shell for a more native install experience

For now, the recommended hosting path is:

1. push this project to GitHub
2. import the repository into Vercel
3. let Vercel deploy automatically on every push

## Online deployment

The project is already prepared for static hosting.

Included deployment files:

- `vercel.json`
- `netlify.toml`
- `.gitignore`

### Recommended: Vercel via GitHub

1. Create a new GitHub repository.
2. Push this project to that repository.
3. Go to [Vercel](https://vercel.com/).
4. Click `Add New -> Project`.
5. Import the GitHub repository.
6. Confirm the build settings:

```text
Build Command: npm run build
Output Directory: dist
```

7. Click `Deploy`.

After that, Vercel will give you a public URL such as:

```text
https://ops-pdf-studio.vercel.app
```

## Secure login setup

The web app is now designed to stay locked until a user signs in with an approved email.

Create a Supabase project and configure these frontend environment variables:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_ALLOWED_EMAILS=ops-manager@yourcompany.com
```

You can copy the template from:

```text
.env.example
```

### Supabase checklist

1. Create a Supabase project.
2. Turn on email auth / magic link sign-in.
3. Add your redirect URLs in Supabase Auth:

```text
http://localhost:3000/**
https://your-production-domain/**
https://your-project.vercel.app/**
```

4. Add the environment variables in Vercel.
5. Redeploy the app.

Important:

- `VITE_ALLOWED_EMAILS` is a frontend allowlist, so the approved email address is not secret
- access still depends on control of that mailbox
- never expose the Supabase `service_role` key in the frontend

## Push to GitHub

If this folder is not a Git repository yet, run:

```bash
git init -b main
git add .
git commit -m "Initial commit"
```

Then connect it to GitHub:

```bash
git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
git push -u origin main
```

## Local development

Install dependencies:

```bash
npm install
```

Run the web app locally:

```bash
npm run dev
```

Build the web app:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## Desktop mode

Run the Tauri desktop app locally:

```bash
npm run desktop:doctor
npm run desktop:dev
```

Build installable desktop bundles:

```bash
npm run desktop:doctor
npm run desktop:build
```

Desktop artifacts are generated under:

```text
src-tauri/target/release/bundle/
```

## Important limitation of the current web version

In the current hosted version, these items are stored in the browser on that machine:

- saved signatures
- templates
- fill profiles
- recent export history

That means:

- it works well from a URL
- it does not automatically sync across computers
- browser storage can be lost if local data is cleared
- browser data is still local even after login, although it is now scoped to the signed-in user in web mode

## What to build next for a professional web version

If you want a more production-ready online version, the next step is:

- database-backed template storage
- cloud storage for signature assets
- permissions and access control

Recommended stack for that phase:

- `Vercel` for hosting
- `Supabase Auth` for login
- `Supabase Storage` for signatures and assets
- `Postgres` via Supabase for templates and history

## Packaging notes

If you distribute the desktop app outside your own machine, the next professional step is code signing:

- macOS signing and notarization
- Windows code signing

The app structure is already prepared for that workflow, but certificates are still required.
