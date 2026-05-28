# Deploy to Vercel

This is the fastest path to get Ops PDF Studio online.

## 1. Create a GitHub repository

Create an empty repository on GitHub.

Example:

```text
ops-pdf-studio
```

## 2. Turn this folder into a Git repository

From the project folder:

```bash
git init -b main
git add .
git commit -m "Initial commit"
```

## 3. Connect the local repo to GitHub

Replace the URL below with your real repository URL:

```bash
git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
git push -u origin main
```

## 4. Import the repository into Vercel

1. Open [vercel.com](https://vercel.com/)
2. Click `Add New -> Project`
3. Select the GitHub repository
4. Keep these settings:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
```

5. Click `Deploy`

## 5. Done

Vercel will generate a public URL for the app.

Every future push to `main` will trigger a new deployment automatically.

## Current storage behavior

The current hosted app stores signatures, templates, and recent history in browser storage on the user's machine.

That is good for a fast MVP, but it is not shared across devices yet.
