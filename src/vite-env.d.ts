/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_ALLOWED_EMAILS?: string;
  readonly VITE_WEB_SIGNATURE_PERSISTENCE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
