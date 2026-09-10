import type { Request } from "express";
import { isIP } from "node:net";
import proxyaddr from "proxy-addr";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

// The local ingress is trusted; additional public ingress CIDRs must be configured explicitly.
const trustProxy = proxyaddr.compile((process.env.COUNTRY_TRUSTED_PROXIES ?? "loopback,linklocal,uniquelocal").split(",").map(value => value.trim()).filter(Boolean));
const privateAddress = proxyaddr.compile(["loopback", "linklocal", "uniquelocal", "0.0.0.0/8", "100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/3", "::/128", "2001:db8::/32", "ff00::/8"]);
export function visitorIp(req: Request): string | null {
  try {
    const ip = proxyaddr(req, trustProxy);
    return ip && isIP(ip) && !privateAddress(ip, 0) ? ip : null;
  } catch { return null; }
}
export function countryName(code: string | null | undefined) {
  if (!code || !/^[A-Z]{2}$/.test(code)) return null;
  const name = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
  return name && name !== code ? name : null;
}
let database: Promise<typeof import("ip-location-api")> | undefined;
export async function lookupCountry(ip: string): Promise<string | null> {
  if (!isIP(ip) || privateAddress(ip, 0)) return null;
  database ??= (async () => {
    process.env.ILA_SKIP_INITIAL_RELOAD = "true";
    const geo = await import("ip-location-api");
    await geo.reload({ fields: ["country"], ipLocationDb: "user", silent: true });
    return geo;
  })().catch(error => { database = undefined; throw error; });
  const geo = await database;
  const result = await geo.lookup(ip);
  const code = result?.country;
  return code && countryName(code) ? code : null;
}
export async function updateCountryFromRequest(req: Request, uid: number) {
  const ip = visitorIp(req);
  if (!ip) return;
  const code = await lookupCountry(ip);
  // Unknown/private addresses must never overwrite the last successfully detected country.
  if (code) await db.update(usersTable).set({ countryCode: code }).where(eq(usersTable.uid, uid));
}
