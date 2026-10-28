import { ConvexHttpClient } from "convex/browser";

export function convexUrl(): string {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL manquant");
  return url;
}

export const convexServeur = () => new ConvexHttpClient(convexUrl());
