import "dotenv/config";

export type TxLineConfig = {
  baseUrl: string;
  guestJwt: string;
  apiToken: string;
  fixtureId?: string;
};

export function readTxLineConfig(): TxLineConfig {
  const baseUrl = process.env.TXLINE_BASE_URL || "https://txline.txodds.com";
  const guestJwt = process.env.TXLINE_GUEST_JWT;
  const apiToken = process.env.TXLINE_API_TOKEN;
  const fixtureId = process.env.TXLINE_FIXTURE_ID;

  const missing = [
    ["TXLINE_GUEST_JWT", guestJwt],
    ["TXLINE_API_TOKEN", apiToken],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""),
    guestJwt: guestJwt!,
    apiToken: apiToken!,
    fixtureId: fixtureId || undefined,
  };
}

export function txLineHeaders(config: TxLineConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.guestJwt}`,
    "X-Api-Token": config.apiToken,
  };
}
