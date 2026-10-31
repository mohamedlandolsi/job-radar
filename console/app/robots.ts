import type { MetadataRoute } from "next";

// Private console: keep every crawler out (root metadata also sets noindex).
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } };
}
