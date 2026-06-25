import "dotenv/config";

import {
  AnchorProvider,
  BN,
  Program,
  Wallet,
  type Idl,
} from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import nacl from "tweetnacl";

const DEFAULTS = {
  rpcUrl: "https://api.mainnet-beta.solana.com",
  baseUrl: "https://txline.txodds.com",
  walletPath: "/Users/oleksandr/.config/solana/id.json",
  programId: "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA",
  tokenMint: "Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL",
  serviceLevelId: 12,
  durationWeeks: 4,
};

const idl = {
  address: DEFAULTS.programId,
  metadata: {
    name: "txoracle",
    version: "1.5.2",
    spec: "0.1.0",
    description: "TxODDS TxLINE Data system",
  },
  instructions: [
    {
      name: "subscribe",
      discriminator: [254, 28, 191, 138, 156, 179, 183, 53],
      accounts: [
        { name: "user", writable: true, signer: true },
        { name: "pricing_matrix" },
        { name: "token_mint" },
        { name: "user_token_account", writable: true },
        { name: "token_treasury_vault", writable: true },
        { name: "token_treasury_pda" },
        { name: "token_program" },
        { name: "system_program" },
        { name: "associated_token_program" },
      ],
      args: [
        { name: "service_level_id", type: "u16" },
        { name: "weeks", type: "u8" },
      ],
    },
  ],
  accounts: [
    {
      name: "PricingMatrix",
      discriminator: [173, 13, 64, 22, 248, 77, 110, 106],
    },
  ],
  types: [
    {
      name: "PricingMatrix",
      type: {
        kind: "struct",
        fields: [
          { name: "admin", type: "pubkey" },
          {
            name: "rows",
            type: { vec: { defined: { name: "ServiceRow" } } },
          },
        ],
      },
    },
    {
      name: "ServiceRow",
      type: {
        kind: "struct",
        fields: [
          { name: "row_id", type: "u16" },
          { name: "price_per_week_token", type: "u64" },
          { name: "sampling_interval_sec", type: "u32" },
          { name: "league_bundle_id", type: "i16" },
          { name: "market_bundle_id", type: "i16" },
        ],
      },
    },
  ],
} satisfies Idl;

const config = {
  rpcUrl: process.env.SOLANA_RPC_URL || DEFAULTS.rpcUrl,
  baseUrl: trimTrailingSlash(process.env.TXLINE_BASE_URL || DEFAULTS.baseUrl),
  walletPath: process.env.SOLANA_WALLET || DEFAULTS.walletPath,
  programId: new PublicKey(process.env.TXLINE_PROGRAM_ID || DEFAULTS.programId),
  tokenMint: new PublicKey(process.env.TXLINE_TOKEN_MINT || DEFAULTS.tokenMint),
  serviceLevelId: Number(process.env.TXLINE_SERVICE_LEVEL_ID || DEFAULTS.serviceLevelId),
  durationWeeks: Number(process.env.TXLINE_DURATION_WEEKS || DEFAULTS.durationWeeks),
  selectedLeagues: parseSelectedLeagues(process.env.TXLINE_SELECTED_LEAGUES),
  existingTxSig: process.env.TXLINE_SUBSCRIPTION_TX_SIG || "",
};

validateConfig();

const keypair = await readKeypair(config.walletPath);
const wallet = new Wallet(keypair);
const connection = new Connection(config.rpcUrl, "confirmed");
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
const program = new Program({ ...idl, address: config.programId.toBase58() }, provider);
const anchorProgram = program as unknown as {
  methods: {
    subscribe: (serviceLevelId: number, durationWeeks: number) => {
      accounts: (accounts: Record<string, unknown>) => { rpc: () => Promise<string> };
    };
  };
  account: {
    pricingMatrix: {
      fetch: (address: PublicKey) => Promise<unknown>;
    };
  };
};

console.log(`Wallet: ${wallet.publicKey.toBase58()}`);
console.log(`RPC: ${config.rpcUrl}`);
console.log(`TxLINE API: ${config.baseUrl}`);
console.log(`Service level: ${config.serviceLevelId}`);
console.log(`Duration weeks: ${config.durationWeeks}`);

const jwt = await getGuestJwt();
await upsertEnvValues(".env", {
  TXLINE_BASE_URL: config.baseUrl,
  TXLINE_GUEST_JWT: jwt,
  SOLANA_RPC_URL: config.rpcUrl,
  SOLANA_WALLET: config.walletPath,
  TXLINE_SERVICE_LEVEL_ID: String(config.serviceLevelId),
  TXLINE_DURATION_WEEKS: String(config.durationWeeks),
  TXLINE_SELECTED_LEAGUES: config.selectedLeagues.join(","),
  TXLINE_PROGRAM_ID: config.programId.toBase58(),
  TXLINE_TOKEN_MINT: config.tokenMint.toBase58(),
});
console.log(`Guest JWT generated and written to .env: ${mask(jwt)}`);

await assertSolBalance();
const txSig = config.existingTxSig || (await subscribeOnChain());
const walletSignature = signActivationMessage(txSig, jwt);
const apiToken = await activateApiToken(txSig, walletSignature, jwt);

await upsertEnvValues(".env", {
  TXLINE_BASE_URL: config.baseUrl,
  TXLINE_GUEST_JWT: jwt,
  TXLINE_API_TOKEN: apiToken,
  SOLANA_RPC_URL: config.rpcUrl,
  SOLANA_WALLET: config.walletPath,
  TXLINE_SERVICE_LEVEL_ID: String(config.serviceLevelId),
  TXLINE_DURATION_WEEKS: String(config.durationWeeks),
  TXLINE_SELECTED_LEAGUES: config.selectedLeagues.join(","),
  TXLINE_PROGRAM_ID: config.programId.toBase58(),
  TXLINE_TOKEN_MINT: config.tokenMint.toBase58(),
  TXLINE_SUBSCRIPTION_TX_SIG: txSig,
});

console.log("TxLINE credentials generated and written to .env");
console.log(`Subscription tx: ${txSig}`);
console.log(`Guest JWT: ${mask(jwt)}`);
console.log(`API token: ${mask(apiToken)}`);

async function subscribeOnChain(): Promise<string> {
  const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pricing_matrix")],
    config.programId,
  );

  const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("token_treasury_v2")],
    config.programId,
  );

  const tokenTreasuryVault = getAssociatedTokenAddressSync(
    config.tokenMint,
    tokenTreasuryPda,
    true,
    TOKEN_2022_PROGRAM_ID,
  );

  console.log(`Pricing matrix PDA: ${pricingMatrixPda.toBase58()}`);
  console.log(`Token treasury PDA: ${tokenTreasuryPda.toBase58()}`);
  console.log(`Token mint: ${config.tokenMint.toBase58()}`);

  await printPricingMatrix(pricingMatrixPda).catch((error) => {
    console.warn(`Could not fetch pricing matrix before subscribing: ${formatError(error)}`);
  });

  const userTokenAccount = getAssociatedTokenAddressSync(
    config.tokenMint,
    wallet.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID,
  );

  console.log(`User token account: ${userTokenAccount.toBase58()}`);
  await ensureAssociatedTokenAccount(userTokenAccount);

  console.log("Submitting free-tier subscription transaction...");

  try {
    const txSignature = await withTimeout(
      anchorProgram.methods
        .subscribe(config.serviceLevelId, config.durationWeeks)
        .accounts({
          user: wallet.publicKey,
          pricingMatrix: pricingMatrixPda,
          tokenMint: config.tokenMint,
          userTokenAccount,
          tokenTreasuryVault,
          tokenTreasuryPda,
          tokenProgram: TOKEN_2022_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc(),
      90_000,
      "subscription transaction",
    );

    console.log(`Subscription confirmed: ${txSignature}`);
    return txSignature;
  } catch (error) {
    console.error(`Subscription failed: ${formatError(error)}`);
    console.error("If this wallet already has an active subscription, set TXLINE_SUBSCRIPTION_TX_SIG to the original subscribe transaction and rerun.");
    throw error;
  }
}

async function ensureAssociatedTokenAccount(userTokenAccount: PublicKey): Promise<void> {
  console.log("Checking user token account...");
  const existingAccount = await withTimeout(
    connection.getAccountInfo(userTokenAccount, "confirmed"),
    30_000,
    "token account lookup",
  );

  if (existingAccount) {
    console.log("User token account already exists.");
    return;
  }

  console.log("Creating user token account...");
  const transaction = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      wallet.publicKey,
      userTokenAccount,
      wallet.publicKey,
      config.tokenMint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
  );

  const signature = await withTimeout(
    sendAndConfirmTransaction(connection, transaction, [keypair], {
      commitment: "confirmed",
    }),
    90_000,
    "token account creation",
  );

  console.log(`User token account created: ${signature}`);
}

async function assertSolBalance(): Promise<void> {
  const lamports = await withTimeout(
    connection.getBalance(wallet.publicKey, "confirmed"),
    30_000,
    "wallet balance lookup",
  );
  console.log(`Wallet SOL balance: ${lamports / 1_000_000_000}`);

  if (lamports === 0) {
    throw new Error(`Wallet has no SOL for transaction fees. Fund ${wallet.publicKey.toBase58()} on mainnet, then rerun npm run txline:auth.`);
  }

  const rentExemption = await withTimeout(
    connection.getMinimumBalanceForRentExemption(170, "confirmed"),
    30_000,
    "rent exemption lookup",
  );
  const minimumLamports = rentExemption + 25_000;

  if (lamports < minimumLamports) {
    throw new Error(
      `Wallet needs at least ${minimumLamports / 1_000_000_000} SOL to create the Token-2022 account and pay fees. Current balance is ${lamports / 1_000_000_000} SOL.`,
    );
  }
}

async function printPricingMatrix(pricingMatrixPda: PublicKey): Promise<void> {
  const matrix = await anchorProgram.account.pricingMatrix.fetch(pricingMatrixPda);
  const rows = (matrix as { rows: Array<Record<string, unknown>> }).rows.map((rawRow) => {
    const row = rawRow as {
      rowId?: unknown;
      pricePerWeekToken?: unknown;
      samplingIntervalSec?: unknown;
      leagueBundleId?: unknown;
      marketBundleId?: unknown;
    };

    const pricePerWeekToken = row.pricePerWeekToken;

    return {
    rowId: String(row.rowId),
    pricePerWeekToken: formatMaybeBn(pricePerWeekToken),
    samplingIntervalSec: String(row.samplingIntervalSec),
    leagueBundleId: String(row.leagueBundleId),
    marketBundleId: String(row.marketBundleId),
    };
  });

  console.table(rows);
}

async function getGuestJwt(): Promise<string> {
  const response = await fetch(`${config.baseUrl}/auth/guest/start`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Guest auth failed: ${response.status} ${response.statusText}\n${await response.text()}`);
  }

  const body = (await response.json()) as { token?: string };
  if (!body.token) {
    throw new Error(`Guest auth response did not include token: ${JSON.stringify(body)}`);
  }

  return body.token;
}

function signActivationMessage(txSig: string, jwt: string): string {
  const messageString = `${txSig}:${config.selectedLeagues.join(",")}:${jwt}`;
  const message = new TextEncoder().encode(messageString);
  const signatureBytes = nacl.sign.detached(message, keypair.secretKey);
  return Buffer.from(signatureBytes).toString("base64");
}

async function activateApiToken(txSig: string, walletSignature: string, jwt: string): Promise<string> {
  const response = await fetch(`${config.baseUrl}/api/token/activate`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      txSig,
      walletSignature,
      leagues: config.selectedLeagues,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`API token activation failed: ${response.status} ${response.statusText}\n${text}`);
  }

  try {
    const json = JSON.parse(text) as { token?: string };
    if (json.token) return json.token;
  } catch {
    // Plain text token is the documented response shape.
  }

  return text.trim();
}

async function readKeypair(walletPath: string): Promise<Keypair> {
  const raw = await readFile(resolve(walletPath), "utf8");
  const bytes = JSON.parse(raw) as number[];

  return Keypair.fromSecretKey(Uint8Array.from(bytes));
}

async function upsertEnvValues(path: string, values: Record<string, string>): Promise<void> {
  const existing = await readFile(path, "utf8").catch(() => "");
  const lines = existing.split(/\r?\n/).filter((line) => line.length > 0);
  const seen = new Set<string>();
  const updated = lines.map((line) => {
    const match = /^([A-Z0-9_]+)=/.exec(line);
    if (!match) return line;

    const key = match[1];
    if (!key || !(key in values)) return line;

    seen.add(key);
    return `${key}=${values[key]}`;
  });

  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) updated.push(`${key}=${value}`);
  }

  await writeFile(path, `${updated.join("\n")}\n`);
}

function parseSelectedLeagues(value: string | undefined): number[] {
  if (!value) return [];

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => Number(item));
}

function validateConfig(): void {
  if (!Number.isInteger(config.serviceLevelId) || config.serviceLevelId <= 0) {
    throw new Error("TXLINE_SERVICE_LEVEL_ID must be a positive integer.");
  }

  if (!Number.isInteger(config.durationWeeks) || config.durationWeeks <= 0) {
    throw new Error("TXLINE_DURATION_WEEKS must be a positive integer.");
  }

  if (config.selectedLeagues.some((league) => !Number.isInteger(league))) {
    throw new Error("TXLINE_SELECTED_LEAGUES must be a comma-separated list of integers.");
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/$/, "");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function mask(value: string): string {
  if (value.length <= 12) return "***";
  return `${value.slice(0, 6)}...${value.slice(-6)}`;
}

function formatMaybeBn(value: unknown): string {
  if (value && typeof value === "object" && "toString" in value) {
    return String((value as { toString: () => string }).toString());
  }

  return String(value);
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
