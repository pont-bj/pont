import { describe, expect, it } from "vitest";
import { compter, correspond, dateCourte, ilYA, montant, nomOperateur, versCsv, volumeParJour } from "../lib/calculs";

const JOUR = 86_400_000;
const midi = new Date(2026, 9, 27, 12, 0, 0).getTime();
const ligne = (status: string, amount: number, createdAt: number, needsReconciliation = false) => ({ status, amount, createdAt, updatedAt: createdAt, needsReconciliation, provider: "fedapay" });

describe("calculs du dashboard", () => {
  it("volume par jour : seuls les paiements réussis comptent, le dernier jour est aujourd'hui", () => {
    const barres = volumeParJour([ligne("succeeded", 1000, midi), ligne("succeeded", 500, midi - 2 * JOUR), ligne("failed", 9999, midi), ligne("succeeded", 7, midi - 30 * JOUR)], midi);
    expect(barres).toHaveLength(7);
    expect(barres[6]!.volume).toBe(1000);
    expect(barres[4]!.volume).toBe(500);
    expect(barres.reduce((somme, barre) => somme + barre.volume, 0)).toBe(1500);
  });

  it("filtres de statut : un statut incertain n'est ni en attente ni échoué", () => {
    expect(correspond({ status: "pending", needsReconciliation: true }, "attente")).toBe(false);
    expect(correspond({ status: "pending", needsReconciliation: true }, "reconcilier")).toBe(true);
    expect(correspond({ status: "succeeded", needsReconciliation: true }, "reconcilier")).toBe(false);
    expect(correspond({ status: "expired", needsReconciliation: false }, "echoues")).toBe(true);
  });

  it("compte chaque filtre", () => {
    const compte = compter([ligne("succeeded", 1, midi), ligne("failed", 1, midi), ligne("pending", 1, midi, true), ligne("processing", 1, midi)]);
    expect(compte).toEqual({ tous: 4, reussis: 1, attente: 1, echoues: 1, reconcilier: 1 });
  });

  it("dates façon maquette", () => {
    expect(dateCourte(midi - 3_600_000, midi)).toMatch(/^Auj\., 11[:h]00$/);
    expect(dateCourte(midi - JOUR, midi)).toMatch(/^Hier, /);
    expect(dateCourte(midi - 5 * JOUR, midi)).toMatch(/oct\./);
    expect(ilYA(midi - 120_000, midi)).toBe("il y a 2 min");
    expect(ilYA(midi - 5_000, midi)).toBe("à l'instant");
  });

  it("noms lisibles", () => {
    expect(nomOperateur("mtn_bj", "BJ")).toBe("MTN Bénin");
    expect(nomOperateur(null, "SN")).toBe("Sénégal");
    expect(montant(1240000, "XOF")).toBe("1\u202f240\u202f000 XOF");
  });

  it("CSV : séparateur, guillemets, neutralisation des formules", () => {
    const csv = versCsv(["Référence", "Montant"], [["=CMD()", 5000], ['a"b;c', 1]]);
    expect(csv).toContain("Référence;Montant");
    expect(csv).toContain("'=CMD();5000");
    expect(csv).toContain('"a""b;c";1');
  });
});
