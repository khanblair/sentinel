import type { PrismaClient } from "@prisma/client";
import { NotFoundError, ValidationError } from "../../errors.js";
import { decrypt, encrypt } from "../../security/encryption.js";
import type { Provider } from "@sentinel/shared";

const KNOWN_PROVIDERS: ReadonlySet<Provider> = new Set([
  "claude",
  "deepseek",
  "gemini",
  "openai",
  "openrouter",
]);

export interface ProviderConfigSummary {
  id: string;
  provider: Provider;
  label: string | null;
  createdAt: Date;
}

export interface CreateProviderConfigInput {
  provider: Provider;
  apiKey: string;
  label?: string | null;
}

export class ProviderConfigRepository {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly encryptionKey: Buffer,
  ) {}

  /** Never returns the decrypted key — safe to expose over HTTP. */
  async create(input: CreateProviderConfigInput): Promise<ProviderConfigSummary> {
    if (!KNOWN_PROVIDERS.has(input.provider)) {
      throw new ValidationError(`Unknown provider "${input.provider}"`);
    }
    if (!input.apiKey.trim()) {
      throw new ValidationError("API key is required");
    }

    const created = await this.prisma.providerConfig.create({
      data: {
        provider: input.provider,
        label: input.label ?? null,
        apiKeyEncrypted: encrypt(input.apiKey, this.encryptionKey),
      },
    });
    return { id: created.id, provider: created.provider as Provider, label: created.label, createdAt: created.createdAt };
  }

  async list(): Promise<ProviderConfigSummary[]> {
    const rows = await this.prisma.providerConfig.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      provider: row.provider as Provider,
      label: row.label,
      createdAt: row.createdAt,
    }));
  }

  async delete(id: string): Promise<void> {
    const row = await this.prisma.providerConfig.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundError(`ProviderConfig ${id} not found`);
    }
    await this.prisma.providerConfig.delete({ where: { id } });
  }

  /** Internal use only (constructing a provider adapter) — never route this to an HTTP response. */
  async getDecryptedApiKey(id: string): Promise<{ provider: Provider; apiKey: string }> {
    const row = await this.prisma.providerConfig.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundError(`ProviderConfig ${id} not found`);
    }
    return { provider: row.provider as Provider, apiKey: decrypt(row.apiKeyEncrypted, this.encryptionKey) };
  }
}
