// R84 compatibility shim.
//
// `project-diligence-completion.tsx` remains an internal implementation module
// used by the registered R84 wrapper route. React Router only generates +types
// for registered route modules, so reuse the wrapper's generated route contract
// rather than exposing the legacy implementation under a second URL.
export type { Route } from "./project-diligence-bridge";
