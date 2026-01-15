/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
  VITE_AUTH_URI: string;
  VITE_AUTH_CLIENT_ID?: string;
  VITE_AUTH_REDIRECT_URI: string;
  VITE_LIVESTORE_URL?: string;
  VITE_RUNTIME_COMMAND?: string;
  VITE_GIT_COMMIT_HASH?: string;
  VITE_AI_PROVIDER?: string;
  VITE_ANACONDA_API_KEY?: string;
  VITE_RUNT_API_KEY?: string;
  VITE_OPENAI_API_KEY?: string;
  VITE_GROQ_API_KEY?: string;
  VITE_LS_DEV?: string;
  VITE_USE_PROJECTS_ARTIFACTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
