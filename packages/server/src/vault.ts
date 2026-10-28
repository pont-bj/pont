import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { PontError } from "@pont-bj/core";
import type { SecretStore } from "@pont-bj/engine";

const VERSION = "v1";

/**
 * Coffre de secrets : AES-256-GCM, clé maître `PONT_ENCRYPTION_KEY` (32 octets en hexadécimal) qui ne touche jamais la base.
 * Format stocké : `v1.<iv>.<tag>.<texte chiffré>` en base64url. La clé de stockage sert de donnée authentifiée :
 * une valeur recopiée sous une autre clé ne se déchiffre plus.
 */
export class Vault {
  private readonly key: Buffer;

  constructor(
    private readonly store: SecretStore,
    masterKeyHex: string,
  ) {
    if (!/^[0-9a-f]{64}$/i.test(masterKeyHex)) {
      throw new PontError("configuration_error", "PONT_ENCRYPTION_KEY doit faire 64 caractères hexadécimaux.", "Générez-la avec : openssl rand -hex 32");
    }
    this.key = Buffer.from(masterKeyHex, "hex");
  }

  seal(storageKey: string, plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(storageKey));
    const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
  }

  open(storageKey: string, sealed: string): string {
    const [version, iv, tag, body] = sealed.split(".");
    if (version !== VERSION || !iv || !tag || !body) throw new PontError("configuration_error", `Valeur du coffre illisible (${storageKey}).`);
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64url"));
      decipher.setAAD(Buffer.from(storageKey));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
    } catch {
      throw new PontError(
        "configuration_error",
        `Impossible de déchiffrer ${storageKey}.`,
        "PONT_ENCRYPTION_KEY a changé depuis l'enregistrement : remettez l'ancienne clé, ou ressaisissez les clés dans le dashboard.",
      );
    }
  }

  async getJson(storageKey: string): Promise<unknown> {
    const sealed = await this.store.get(storageKey);
    return sealed === null ? null : JSON.parse(this.open(storageKey, sealed));
  }

  async putJson(storageKey: string, value: unknown): Promise<void> {
    await this.store.put(storageKey, this.seal(storageKey, JSON.stringify(value)));
  }

  delete(storageKey: string): Promise<void> {
    return this.store.delete(storageKey);
  }

  list(prefix: string): Promise<Array<{ key: string; updatedAt: number }>> {
    return this.store.list(prefix);
  }
}
