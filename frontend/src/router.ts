import { useEffect, useState } from "react";

export type Route =
  | { name: "overview" }
  | { name: "challenges" }
  | { name: "challenge"; id: number }
  | { name: "pilot"; id: number }
  | { name: "startups" }
  | { name: "startup"; id: number }
  | { name: "evidence" }
  | { name: "records" }
  | { name: "record"; id: number }
  | { name: "unknown"; path: string };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, "").replace(/\/+$/, "");
  const parts = path.split("/").filter(Boolean);
  const first = parts[0] ?? "overview";
  if (first === "overview" || first === "") return { name: "overview" };
  if (first === "challenges") {
    if (parts.length > 1) {
      const id = Number(parts[1]);
      return Number.isInteger(id) ? { name: "challenge", id } : { name: "challenges" };
    }
    return { name: "challenges" };
  }
  if (first === "pilots") {
    const id = Number(parts[1]);
    return Number.isInteger(id) ? { name: "pilot", id } : { name: "overview" };
  }
  if (first === "startups") {
    if (parts.length > 1) {
      const id = Number(parts[1]);
      return Number.isInteger(id) ? { name: "startup", id } : { name: "startups" };
    }
    return { name: "startups" };
  }
  if (first === "evidence") return { name: "evidence" };
  if (first === "records") {
    if (parts.length > 1) {
      const id = Number(parts[1]);
      return Number.isInteger(id) ? { name: "record", id } : { name: "records" };
    }
    return { name: "records" };
  }
  return { name: "unknown", path };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(to: string): void {
  window.location.hash = to;
}

/** Renders only when the browser hash matches. */
export function hrefFor(to: string): string {
  return `#${to}`;
}
