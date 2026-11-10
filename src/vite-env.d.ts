/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 'off' turns error reporting off in a production build (the widget build sets it). */
  readonly VITE_ERROR_REPORTING?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
