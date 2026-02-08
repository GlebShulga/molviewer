/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NEW_RELIC_LICENSE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
