import { describe, expect, it } from "vitest";
import { couleurMonogramme, estUrlNonPublique, initiales } from "../lib/identite";
import { cibleDeSequence, estChampDeSaisie, sectionDeTouche } from "../lib/raccourcis";

describe("identité visuelle", () => {
  it("monogramme : couleur stable, initiales lisibles", () => {
    expect(couleurMonogramme("monagregateur")).toBe(couleurMonogramme("monagregateur"));
    expect(couleurMonogramme("monagregateur")).toMatch(/^#[0-9a-f]{6}$/);
    expect(initiales("Mon Agrégateur")).toBe("MA");
    expect(initiales("momopay")).toBe("MO");
    expect(initiales("")).toBe("?");
  });
});

describe("adresse publique", () => {
  it.each(["http://localhost:8787", "https://localhost", "https://127.0.0.1", "http://pont.exemple.bj", "https://192.168.1.20", "https://10.0.0.5:8787", "https://172.20.1.1", "https://pont.local", "https://[::1]", "pas une url", "https://0.0.0.0"])("%s n'est pas joignable par un agrégateur", (adresse) => {
    expect(estUrlNonPublique(adresse)).toBe(true);
  });
  it.each(["https://api.ma-fintech.com", "https://pont.exemple.bj:8443", "https://172.32.0.1", "https://8.8.8.8"])("%s est publique", (adresse) => {
    expect(estUrlNonPublique(adresse)).toBe(false);
  });
});

describe("raccourcis clavier", () => {
  const cibles = [
    { touche: "p", label: "Paiements", href: "/paiements" },
    { touche: "a", label: "Agrégateurs", href: "/agregateurs" },
  ];
  it("séquence g puis lettre : insensible à la casse, inconnue → null", () => {
    expect(cibleDeSequence("p", cibles)?.href).toBe("/paiements");
    expect(cibleDeSequence("P", cibles)?.href).toBe("/paiements");
    expect(cibleDeSequence("z", cibles)).toBeNull();
  });
  it("ne vole aucune frappe dans un champ", () => {
    expect(estChampDeSaisie({ tagName: "INPUT" })).toBe(true);
    expect(estChampDeSaisie({ tagName: "TEXTAREA" })).toBe(true);
    expect(estChampDeSaisie({ tagName: "SELECT" })).toBe(true);
    expect(estChampDeSaisie({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(estChampDeSaisie({ tagName: "DIV", getAttribute: () => "combobox" })).toBe(true);
    expect(estChampDeSaisie({ tagName: "BUTTON" })).toBe(false);
    expect(estChampDeSaisie(null)).toBe(false);
  });
  it("sections : chiffres, j et k restent dans les bornes", () => {
    const sections = [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }];
    expect(sectionDeTouche("2", sections, 0)).toBe(1);
    expect(sectionDeTouche("9", sections, 0)).toBeNull();
    expect(sectionDeTouche("j", sections, 2)).toBe(2);
    expect(sectionDeTouche("j", sections, 0)).toBe(1);
    expect(sectionDeTouche("k", sections, 0)).toBe(0);
    expect(sectionDeTouche("x", sections, 0)).toBeNull();
    expect(sectionDeTouche("1", [], 0)).toBeNull();
  });
});
