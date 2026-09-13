import { adminAuthConfig } from "./routes/admin";
import path from "node:path";
import { fileURLToPath } from "node:url";
import publicSite from "./routes/publicSite";
import { diditWebhook } from "./routes/verification";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Public shell only; every live admin request requires staff authorization.
const adminAssets = path.join(path.dirname(fileURLToPath(import.meta.url)), "admin");
app.use(["/api/admin", "/admin"], (_req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("X-Content-Type-Options", "nosniff");
  let clerkOrigin = "";
  try { clerkOrigin = adminAuthConfig().frontendApi; } catch { /* UI shows configuration error */ }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Security-Policy", `default-src 'self'; script-src 'self' ${clerkOrigin} https://challenges.cloudflare.com; connect-src 'self' ${clerkOrigin}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://img.clerk.com ${clerkOrigin}; font-src 'self' ${clerkOrigin} data:; frame-src ${clerkOrigin} https://challenges.cloudflare.com; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self' ${clerkOrigin}`);
  next();
}, express.static(adminAssets, { index: "index.html" }));

app.use("/api/site", publicSite);
app.use(publicSite);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.post("/api/verification/webhook", express.raw({ type: "application/json", limit: "1mb" }), diditWebhook);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env["CLERK_PUBLISHABLE_KEY"],
    ),
  })),
);

app.use("/api", router);

export default app;
