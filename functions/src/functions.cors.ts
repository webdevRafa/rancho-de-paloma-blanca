
// functions/src/cors.ts
// Lightweight CORS helper for Firebase Functions v2 (no external deps).
// Usage inside an onRequest handler:
//   if (corsify(req, res)) return; // handles OPTIONS and sets headers
//
// It echoes allowed origins, sets Vary: Origin, and supports simple POST/GET.
export function corsify(req: any, res: any, extraAllowed: (string|RegExp)[] = []): boolean {
  const DEFAULT_ALLOWED: (string|RegExp)[] = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    /\.vercel\.app$/i,
  ];
  const allowed = [...DEFAULT_ALLOWED, ...extraAllowed];
  const origin = (req.headers?.origin as string) || "";

  const isAllowed = origin && allowed.some((a) => {
    if (typeof a === "string") return a === origin;
    if (a instanceof RegExp) return a.test(origin);
    return false;
  });

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (isAllowed) res.setHeader("Access-Control-Allow-Origin", origin);
  else res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
}
