import "dotenv/config";

const frontendOrigins = (process.env.FRONTEND_ORIGIN || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const serverEnv = {
  port: Number(process.env.SERVER_PORT || 4000),
  frontendOrigins,
  txlineBaseUrl: (process.env.TXLINE_BASE_URL || "https://txline.txodds.com").replace(/\/$/, ""),
  txlineGuestJwt: process.env.TXLINE_GUEST_JWT || "",
  txlineApiToken: process.env.TXLINE_API_TOKEN || "",
  adminTestToken: process.env.ADMIN_TEST_TOKEN || "",
};

export function requireTxLineCredentials(): void {
  const missing = [
    ["TXLINE_GUEST_JWT", serverEnv.txlineGuestJwt],
    ["TXLINE_API_TOKEN", serverEnv.txlineApiToken],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing TxLINE credentials: ${missing.join(", ")}`);
  }
}
