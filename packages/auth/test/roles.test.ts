import { describe, expect, it } from "vitest";
import { PRESETS, PRESET_NAMES, RoleSet, definePont } from "../src/index.js";

describe("RoleSet", () => {
  const roles = RoleSet.from(PRESETS.portefeuille);

  it("accorde uniquement les permissions déclarées", () => {
    expect(roles.can("client", "paiements", "creer")).toBe(true);
    expect(roles.can("client", "paiements", "rembourser")).toBe(false);
    expect(roles.can("client", "registre", "lire")).toBe(false);
    expect(roles.can("comptable", "registre", "lire")).toBe(true);
  });

  it("réserve l'accès au dashboard aux rôles qui l'ont explicitement", () => {
    expect(roles.can("client", "dashboard", "acceder")).toBe(false);
    expect(roles.can("agent", "dashboard", "acceder")).toBe(false);
    expect(roles.can("comptable", "dashboard", "acceder")).toBe(true);
    expect(roles.can("admin", "dashboard", "acceder")).toBe(true);
  });

  it("donne tout à un rôle « accès total »", () => {
    expect(roles.can("admin", "cles", "gerer")).toBe(true);
    expect(roles.can("admin", "roles", "gerer")).toBe(true);
  });

  it("refuse un rôle inconnu, nul ou vide", () => {
    expect(roles.can("pirate", "paiements", "lire")).toBe(false);
    expect(roles.can(null, "paiements", "lire")).toBe(false);
    expect(roles.can(undefined, "paiements", "lire")).toBe(false);
    expect(roles.can("", "paiements", "lire")).toBe(false);
  });

  it("liste les permissions effectives, y compris pour l'accès total", () => {
    expect(roles.permissionsOf("client")).toEqual({ paiements: ["creer", "lire"], retraits: ["creer", "lire"], portefeuille: ["lire"] });
    expect(Object.keys(roles.permissionsOf("admin"))).toHaveLength(10);
    expect(roles.permissionsOf("pirate")).toEqual({});
  });

  it("expose le palier KYC d'un rôle", () => {
    expect(roles.get("agent")?.kycTier).toBe("complet");
  });

  it("valide tous les modèles livrés", () => {
    for (const name of PRESET_NAMES) expect(() => RoleSet.from(PRESETS[name])).not.toThrow();
  });
});

describe("validation", () => {
  it("rejette une ressource ou une action inconnue", () => {
    expect(() => RoleSet.from({ x1: { permissions: { cryptos: ["lire"] } } })).toThrow(/Ressource inconnue/);
    expect(() => RoleSet.from({ x1: { permissions: { paiements: ["detruire"] } } })).toThrow(/Action inconnue/);
  });

  it("rejette un nom de rôle invalide", () => {
    expect(() => RoleSet.from({ "Admin Général": { all: true } })).toThrow();
    expect(() => RoleSet.from({ "": { all: true } })).toThrow();
  });

  it("rejette « accès total » combiné à des permissions, et un ensemble vide", () => {
    expect(() => RoleSet.from({ boss: { all: true, permissions: { paiements: ["lire"] } } })).toThrow(/accès total/);
    expect(() => RoleSet.from({})).toThrow(/Au moins un rôle/);
  });

  it("rejette les champs inattendus", () => {
    expect(() => RoleSet.from({ boss: { all: true, secret: "x" } })).toThrow();
  });

  it("definePont valide la configuration", () => {
    expect(() => definePont({ roles: { client: { permissions: { paiements: ["lire"] } } } })).not.toThrow();
    expect(() => definePont({ roles: { client: { permissions: { paiements: ["x"] } } } })).toThrow();
  });
});
