import dotenv from "dotenv";
import { isValidTimeZone } from "../utils/timeZone.js";

dotenv.config();

const port = Number(process.env.PORT ?? 8000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535.");
}

const mongoUri = process.env.MONGODB_URI?.trim();
if (!mongoUri) {
  throw new Error(
    "MONGODB_URI is required. Add it to your environment or .env file.",
  );
}

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || Buffer.byteLength(jwtSecret, "utf8") < 32) {
  throw new Error("JWT_SECRET must be set to a secret of at least 32 bytes.");
}

const defaultTimeZone = process.env.DEFAULT_TIME_ZONE?.trim() || "Asia/Kolkata";
if (!isValidTimeZone(defaultTimeZone)) {
  throw new Error("DEFAULT_TIME_ZONE must be a valid IANA time zone.");
}

const normalizeCorsOrigin = (origin) => {
  let url;
  try {
    url = new URL(origin);
  } catch {
    throw new Error("CORS_ORIGINS must contain valid http or https origins.");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "CORS_ORIGINS must contain origins without paths or credentials.",
    );
  }

  return url.origin;
};

const defaultCorsOrigins = [
  "http://localhost:2000",
  "http://localhost:3000",
  "http://localhost:3001",
];
const corsOrigins =
  process.env.CORS_ORIGINS === undefined
    ? defaultCorsOrigins
    : process.env.CORS_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
        .map(normalizeCorsOrigin);
if (process.env.CORS_ORIGINS !== undefined && corsOrigins.length === 0) {
  throw new Error("CORS_ORIGINS must contain at least one frontend origin.");
}

const renderProxyDefault = process.env.RENDER?.toLowerCase() === "true" ? 1 : 0;
const trustProxyHops = Number(
  process.env.TRUST_PROXY_HOPS ?? renderProxyDefault,
);
if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0) {
  throw new Error("TRUST_PROXY_HOPS must be a non-negative integer.");
}

const config = Object.freeze({
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: port,
  MONGODB_URI: mongoUri,
  JWT_SECRET: jwtSecret,
  CORS_ORIGINS: Object.freeze(corsOrigins),
  TRUST_PROXY_HOPS: trustProxyHops,
  FIREBASE_SERVICE_ACCOUNT_PATH:
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim() ?? "",
  DEFAULT_TIME_ZONE: defaultTimeZone,
});

export default config;
