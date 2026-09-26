export const DIVISION_PATHS = [
    { key: "marketing", basePath: "/marketing" },
    { key: "sales", basePath: "/sales" },
    { key: "ta", basePath: "/ta" },
    { key: "hr", basePath: "/hr" },
    { key: "tm", basePath: "/tm" },
    { key: "pmo", basePath: "/pmo" },
    { key: "finance", basePath: "/finance" },
    { key: "school", basePath: "/school" },
    { key: "automation", basePath: "/automation" },
  ] as const;

/**
 * Path kolaborasi lintas divisi -- dicek SEBELUM DIVISION_PATHS, akses OK
 * asal user punya salah satu dari `keys`.
 */
export const CROSS_DIVISION_PATHS = [
  { keys: ["ta", "sales"], basePath: "/ta/client-active" },
  { keys: ["tm", "hr"], basePath: "/tm/special-notes" },
  { keys: ["pmo", "finance"], basePath: "/finance" },
  { keys: ["pmo", "sales", "finance", "hr"], basePath: "/pmo/overtime-business-trip" },
  { keys: ["sales", "tm", "pmo"], basePath: "/sales/profitability-tracker" },
] as const;