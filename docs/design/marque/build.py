import subprocess, pathlib, sys
OUT = pathlib.Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
P = "M8 6 H42 A14 14 0 0 1 56 20 V30 A14 14 0 0 1 42 44 H22 V58 H8 Z M22 34 H42 V22 A10 10 0 0 0 22 22 Z"
INDIGO, INDIGO_CLAIR, NOIR, BLANC = "#4F46E5", "#6366F1", "#09090B", "#FFFFFF"

def mark(color, x=0, y=0, h=52):
    s = h / 52
    return f'<path fill="{color}" fill-rule="evenodd" transform="translate({x} {y}) scale({s}) translate(-8 -6)" d="{P}"/>'

def svg(w, h, body, bg=None):
    r = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}">{r}{body}</svg>'

def word(text, x, y, size, color, weight=600, anchor="start"):
    return (f'<text x="{x}" y="{y}" font-family="Outfit" font-weight="{weight}" font-size="{size}" '
            f'fill="{color}" text-anchor="{anchor}">{text}</text>')

def lockup(pc, tc, x=0, y=0, h=200):
    # P = logo, « ont » en Outfit SemiBold, ligne de base = pied du P
    k = h / 200
    return mark(pc, x, y, h) + word("ont", x + 199 * k, y + h, 280 * k, tc)

def render(name, content, scales=(1,)):
    d = OUT / name; d.parent.mkdir(parents=True, exist_ok=True)
    src = d.with_suffix(".svg"); src.write_text(content)
    run = lambda o, *a: subprocess.run(["flatpak", "run", f"--filesystem={OUT}", "--command=vectorcraft-cli",
        "ai.storyteller.vectorcraft", "convert", str(src), str(o), "--outline-text", *a], check=True, capture_output=True)
    run(src)  # texte vectorisé dans le SVG livré
    for sc in scales:
        run(d.parent / f"{d.name}{'' if sc == 1 else f'@{sc}x'}.png", "--scale", str(sc))
    run(d.with_suffix(".pdf"))

# 1. Symbole
for nom, c in [("indigo", INDIGO), ("indigo-clair", INDIGO_CLAIR), ("noir", NOIR), ("blanc", BLANC)]:
    render(f"01-symbole/pont-symbole-{nom}", svg(48, 52, mark(c)), scales=(4, 10, 20))

# 2. Logotype (P + ont)
LW, LH = 615, 200
for nom, pc, tc, bg in [("clair", INDIGO, NOIR, None), ("sombre", INDIGO_CLAIR, BLANC, None),
                        ("mono-noir", NOIR, NOIR, None), ("mono-blanc", BLANC, BLANC, None),
                        ("indigo-sur-blanc", INDIGO, INDIGO, None)]:
    render(f"02-logotype/pont-logotype-{nom}", svg(LW, LH, lockup(pc, tc)), scales=(1, 2, 4))

# 3. Icône d'application et favicons
def icone(n, bg=INDIGO, fg=BLANC, rx=0.22):
    h = n * 0.62
    return svg(n, n, f'<rect width="{n}" height="{n}" rx="{n*rx}" fill="{bg}"/>' + mark(fg, (n - h * 48 / 52) / 2, (n - h) / 2, h))
render("03-icone/pont-icone", icone(64), scales=(1,))
for n in (16, 32, 48, 64, 128, 180, 192, 256, 512, 1024):
    render(f"03-icone/tailles/pont-icone-{n}", icone(n), scales=(1,))
render("03-icone/pont-icone-carree", icone(512, rx=0), scales=(1, 2))
render("03-icone/pont-icone-sombre", icone(512, bg=NOIR, fg=INDIGO_CLAIR), scales=(1, 2))

# 4. Réseaux sociaux
def centre(w, h, bg, pc, tc, sous, sc_col, lh):
    lw = LW * lh / LH
    y = h / 2 - lh / 2 - (40 if sous else 0)
    b = lockup(pc, tc, (w - lw) / 2, y, lh)
    if sous:
        b += (f'<text x="{w/2}" y="{y + lh + lh*0.45}" font-family="Inter" font-weight="500" font-size="{lh*0.17}" '
              f'fill="{sc_col}" text-anchor="middle">{sous}</text>')
    return svg(w, h, b, bg)
T1 = "L’infrastructure de paiement des fintechs africaines."
T2 = "Un pont entre votre code et le mobile money."
render("04-reseaux/linkedin-post-4x5", centre(1080, 1350, INDIGO, BLANC, BLANC, T1, "#E0E7FF", 200))
render("04-reseaux/tiktok-story-9x16", centre(1080, 1920, NOIR, INDIGO_CLAIR, BLANC, T2, "#A1A1AA", 220))
render("04-reseaux/instagram-carre-1x1", centre(1080, 1080, INDIGO, BLANC, BLANC, None, None, 220))
render("04-reseaux/open-graph-1200x630", centre(1200, 630, BLANC, INDIGO, NOIR, T1, "#52525B", 150))
render("04-reseaux/linkedin-banniere-1584x396", centre(1584, 396, NOIR, INDIGO_CLAIR, BLANC, None, None, 130))
render("04-reseaux/photo-profil-400", icone(400, rx=0), scales=(1,))
