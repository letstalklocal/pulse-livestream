import { randomUUID } from "crypto";
import { Storage } from "@google-cloud/storage";

const endpoint = "http://127.0.0.1:1106";
const GET_URL_CACHE_MS = 12 * 60 * 1000;
const getUrlCache = new Map<string, { url: string; refreshAt: number }>();
const pendingGetUrls = new Map<string, Promise<string>>();
export const objectStorageClient = new Storage({
  credentials: { audience: "replit", subject_token_type: "access_token", token_url: `${endpoint}/token`, type: "external_account", credential_source: { url: `${endpoint}/credential`, format: { type: "json", subject_token_field_name: "access_token" } }, universe_domain: "googleapis.com" },
  projectId: "",
});

function privatePath() {
  const path = process.env.PRIVATE_OBJECT_DIR;
  if (!path) throw new Error("PRIVATE_OBJECT_DIR is not configured");
  return path.replace(/\/$/, "");
}
function split(path: string) {
  const parts = path.replace(/^\//, "").split("/");
  if (parts.length < 2) throw new Error("Invalid object storage path");
  return { bucketName: parts[0]!, objectName: parts.slice(1).join("/") };
}
async function signed(path: string, method: "GET" | "PUT") {
  const { bucketName, objectName } = split(path);
  const response = await fetch(`${endpoint}/object-storage/signed-object-url`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket_name: bucketName, object_name: objectName, method, expires_at: new Date(Date.now() + 900_000).toISOString() }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Object URL signing failed (${response.status})`);
  return (await response.json() as { signed_url: string }).signed_url;
}
function objectName(objectPath: string) {
  if (!objectPath.startsWith("/objects/")) throw new Error("Invalid private object path");
  return `${privatePath()}/${objectPath.slice("/objects/".length)}`;
}
export async function createPrivateUploadUrl() {
  const name = `uploads/${randomUUID()}`;
  return { uploadUrl: await signed(`${privatePath()}/${name}`, "PUT"), objectPath: `/objects/${name}` };
}
export async function createPrivateGetUrl(path: string) {
  const cached = getUrlCache.get(path);
  if (cached && cached.refreshAt > Date.now()) return cached.url;

  const pending = pendingGetUrls.get(path);
  if (pending) return pending;

  const request = signed(objectName(path), "GET")
    .then((url) => {
      getUrlCache.set(path, { url, refreshAt: Date.now() + GET_URL_CACHE_MS });
      return url;
    })
    .finally(() => {
      pendingGetUrls.delete(path);
    });
  pendingGetUrls.set(path, request);
  return request;
}

export async function deletePrivateObject(path: string) {
  getUrlCache.delete(path);
  pendingGetUrls.delete(path);
  const { bucketName, objectName: storedObjectName } = split(objectName(path));
  await objectStorageClient.bucket(bucketName).file(storedObjectName).delete({ ignoreNotFound: true });
}