#!/usr/bin/env python3
"""
Gera os fundos padrão das paletas (public/backgrounds/*.svg).

Cada paleta tem um fundo próprio para a tela inicial: cenas vetoriais
geradas aqui, com sementes fixas (o resultado é sempre o mesmo). Arquivos e
script: CC0.

Uso:  python3 scripts/backgrounds/render.py
"""

from __future__ import annotations

import math
import os
import random

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "backgrounds")
W, H = 1920, 1080


def ridge(rng: random.Random, base: float, amp: float, step: int, rough: float = 0.55) -> str:
    """Silhueta de serra/colina: pontos com ruído, fechada embaixo."""
    pts = []
    y = base
    for x in range(-40, W + 80, step):
        y += rng.uniform(-amp, amp) * rough
        y = base + (y - base) * 0.82
        pts.append((x, y + amp * math.sin(x / (W / rng.uniform(1.2, 3.0)))))
    d = f"M{-40} {H} " + " ".join(f"L{x:.0f} {y:.1f}" for x, y in pts) + f" L{W + 80} {H} Z"
    return d


def smooth_ridge(rng: random.Random, base: float, amp: float, waves: int) -> str:
    """Colina suave: soma de senoides, com curvas (C)."""
    ph = [rng.uniform(0, 6.28) for _ in range(3)]
    fr = [rng.uniform(0.6, 1.4) * waves * k for k in (1, 2.3, 4.1)]
    am = [amp, amp * 0.35, amp * 0.12]

    def y(x: float) -> float:
        return base + sum(a * math.sin(2 * math.pi * f * x / W + p) for a, f, p in zip(am, fr, ph))

    step = 60
    xs = list(range(-60, W + 120, step))
    d = f"M-60 {H} L-60 {y(-60):.1f} "
    for x0, x1 in zip(xs, xs[1:]):
        c1, c2 = x0 + step / 3, x1 - step / 3
        d += f"C{c1:.0f} {y(c1):.1f} {c2:.0f} {y(c2):.1f} {x1:.0f} {y(x1):.1f} "
    return d + f"L{W + 120} {H} Z"


def pine(x: float, y: float, h: float) -> str:
    w = h * 0.34
    tiers = 4
    d = ""
    for i in range(tiers):
        top = y - h + i * h * 0.2
        bot = top + h * 0.42
        ww = w * (0.45 + 0.55 * (i + 1) / tiers)
        d += f"M{x:.1f} {top:.1f} L{x + ww / 2:.1f} {bot:.1f} L{x - ww / 2:.1f} {bot:.1f} Z "
    d += f"M{x - h * 0.03:.1f} {y - h * 0.2:.1f} h{h * 0.06:.1f} v{h * 0.2:.1f} h{-h * 0.06:.1f} Z "
    return d


def stars(rng: random.Random, n: int, ymax: float, color: str) -> str:
    out = []
    for _ in range(n):
        x, y = rng.uniform(0, W), rng.uniform(0, ymax) ** 1.0
        r = rng.choice([0.6, 0.8, 1.0, 1.2, 1.6, 2.2]) if rng.random() < 0.97 else 2.8
        o = rng.uniform(0.35, 1.0) * (1 - y / ymax * 0.6)
        out.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r}" fill="{color}" opacity="{o:.2f}"/>')
    return "".join(out)


def svg(defs: str, body: str) -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" '
        f'preserveAspectRatio="xMidYMid slice"><defs>{defs}</defs>{body}</svg>\n'
    )


def ambar() -> str:
    """Noite dourada: lua cheia sobre serras em camadas e um rio que reflete a luz."""
    rng = random.Random(9)
    defs = (
        '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#070503"/><stop offset=".6" stop-color="#1c1307"/>'
        '<stop offset="1" stop-color="#2c1d0a"/></linearGradient>'
        '<radialGradient id="moon"><stop offset="0" stop-color="#fff3cf"/>'
        '<stop offset=".45" stop-color="#f2d08a" stop-opacity=".55"/><stop offset="1" stop-color="#e2b35a" stop-opacity="0"/></radialGradient>'
        '<linearGradient id="river" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#3a2810"/><stop offset="1" stop-color="#0b0804"/></linearGradient>'
        '<filter id="b30" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="30"/></filter>'
        '<filter id="b6"><feGaussianBlur stdDeviation="6"/></filter>'
    )
    body = '<rect width="100%" height="100%" fill="url(#sky)"/>'
    body += stars(rng, 240, 620, "#f6e3b8")
    # A lua fica à direita, longe do título da tela.
    body += '<circle cx="1420" cy="300" r="260" fill="url(#moon)" opacity=".6"/>'
    body += '<circle cx="1420" cy="300" r="92" fill="#f4dca6" opacity=".95"/>'
    body += '<circle cx="1390" cy="280" r="20" fill="#e2c07e" opacity=".35"/><circle cx="1450" cy="330" r="13" fill="#e2c07e" opacity=".3"/>'
    # Nuvens finas cruzando a lua.
    for y, w, o in ((340, 520, 0.35), (380, 380, 0.25)):
        body += f'<ellipse cx="1380" cy="{y}" rx="{w}" ry="18" fill="#2a1c0b" opacity="{o}" filter="url(#b6)"/>'
    layers = [(560, 70, "#2a1d0d", 34), (640, 60, "#1d1409", 28), (720, 55, "#140e06", 22)]
    for base, amp, color, step in layers:
        d = ridge(rng, base, amp, step)
        body += f'<path d="{d}" fill="{color}"/>'
        body += f'<path d="{d}" fill="none" stroke="#e2b35a" stroke-width="1.2" opacity=".28"/>'
    # Rio sinuoso refletindo a lua.
    body += '<path d="M1040 1080 C 1180 930, 1420 900, 1300 820 S 1180 760, 1260 730 L 1380 730 C 1310 770, 1420 820, 1500 880 S 1640 1000, 1780 1080 Z" fill="url(#river)"/>'
    for i in range(14):
        y = 740 + i * 24
        w = 40 + i * 14
        x = 1320 + math.sin(i * 0.7) * (20 + i * 6)
        body += f'<rect x="{x - w / 2:.0f}" y="{y}" width="{w}" height="2.5" rx="1.2" fill="#f2d08a" opacity="{0.5 - i * 0.03:.2f}" filter="url(#b6)"/>'
    body += '<rect y="600" width="100%" height="200" fill="#e2b35a" opacity=".05" filter="url(#b30)"/>'
    return svg(defs, body)


def esmeralda() -> str:
    """Noite de aurora verde sobre um lago, com serras e pinheiros."""
    rng = random.Random(4)
    defs = (
        '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#010806"/><stop offset=".55" stop-color="#05261c"/>'
        '<stop offset="1" stop-color="#0b3a2b"/></linearGradient>'
        '<linearGradient id="aur" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#3fd9a0" stop-opacity="0"/>'
        '<stop offset=".45" stop-color="#3fd9a0" stop-opacity=".55"/>'
        '<stop offset="1" stop-color="#5ec6d6" stop-opacity="0"/></linearGradient>'
        '<linearGradient id="lake" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#0d4434"/><stop offset="1" stop-color="#010a07"/></linearGradient>'
        '<filter id="b40" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>'
        '<filter id="b8"><feGaussianBlur stdDeviation="8"/></filter>'
        '<radialGradient id="moon"><stop offset="0" stop-color="#f4f0d8"/>'
        '<stop offset=".6" stop-color="#d9c57c" stop-opacity=".5"/><stop offset="1" stop-color="#d9c57c" stop-opacity="0"/></radialGradient>'
    )
    body = '<rect width="100%" height="100%" fill="url(#sky)"/>'
    body += stars(rng, 260, 640, "#e6fff4")
    # Cortinas da aurora: faixas onduladas, bem desfocadas.
    for k, (y0, amp, op) in enumerate(((180, 90, 0.9), (260, 70, 0.7), (130, 60, 0.55))):
        d = f"M-100 {y0}"
        for x in range(0, W + 200, 160):
            d += f" Q{x + 80} {y0 + rng.uniform(-amp, amp):.0f} {x + 160} {y0 + rng.uniform(-amp, amp) * 0.6:.0f}"
        d += f" L{W + 200} {y0 + 260} L-100 {y0 + 260} Z"
        body += f'<path d="{d}" fill="url(#aur)" opacity="{op}" filter="url(#b40)"/>'
    body += '<circle cx="1480" cy="210" r="120" fill="url(#moon)" opacity=".55"/>'
    body += '<circle cx="1480" cy="210" r="34" fill="#f4f0d8" opacity=".9"/>'
    # Serras ao longe e perto.
    body += f'<path d="{ridge(rng, 600, 60, 30)}" fill="#0a3326" opacity=".9"/>'
    body += f'<path d="{ridge(rng, 680, 45, 24)}" fill="#062319"/>'
    trees = "".join(pine(x, 760 + rng.uniform(-14, 10), rng.uniform(70, 150)) for x in range(-20, W + 40, 26))
    body += f'<path d="{trees}" fill="#03140e"/>'
    body += '<rect y="760" width="100%" height="320" fill="url(#lake)"/>'
    # Reflexo da lua e da aurora no lago.
    for i in range(9):
        y = 790 + i * 30
        w = 140 - i * 11
        body += f'<rect x="{1480 - w / 2:.0f}" y="{y}" width="{w}" height="3" rx="1.5" fill="#f4f0d8" opacity="{0.45 - i * 0.04:.2f}" filter="url(#b8)"/>'
    body += '<rect y="760" width="100%" height="120" fill="#3fd9a0" opacity=".06" filter="url(#b40)"/>'
    return svg(defs, body)


def perola() -> str:
    """Seda iridescente: ondas de nácar em lilás, rosa e água-marinha."""
    rng = random.Random(7)
    defs = (
        '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">'
        '<stop offset="0" stop-color="#fbf7f2"/><stop offset=".5" stop-color="#f3ece6"/>'
        '<stop offset="1" stop-color="#ece4ec"/></linearGradient>'
        '<filter id="b60" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="60"/></filter>'
        '<filter id="b3"><feGaussianBlur stdDeviation="2.5"/></filter>'
    )
    tints = ["#d9c2e6", "#f2cfd9", "#c8e3ea", "#e9dcc4", "#dccfee", "#f5d6e0"]
    body = '<rect width="100%" height="100%" fill="url(#bg)"/>'
    for i in range(7):
        cx, cy = rng.uniform(0, W), rng.uniform(0, H)
        rx, ry = rng.uniform(280, 620), rng.uniform(180, 420)
        body += (
            f'<ellipse cx="{cx:.0f}" cy="{cy:.0f}" rx="{rx:.0f}" ry="{ry:.0f}" '
            f'fill="{tints[i % len(tints)]}" opacity=".75" filter="url(#b60)"/>'
        )
    # Fios de nácar: curvas paralelas que cruzam a tela, como seda.
    for band in range(3):
        y0 = 260 + band * 300 + rng.uniform(-40, 40)
        amp = rng.uniform(60, 120)
        f = rng.uniform(0.8, 1.4)
        ph = rng.uniform(0, 6.28)
        for j in range(16):
            off = j * 7
            d = ""
            for x in range(-100, W + 140, 40):
                y = y0 + off + amp * math.sin(2 * math.pi * f * x / W + ph + j * 0.05)
                d += ("M" if not d else "L") + f"{x} {y:.1f} "
            color = tints[(band + j // 6) % len(tints)]
            body += f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.4" opacity="{0.55 - j * 0.025:.2f}"/>'
        body += f'<path d="M-100 {y0 + 50} C {W * 0.3:.0f} {y0 - amp:.0f}, {W * 0.7:.0f} {y0 + amp * 1.6:.0f}, {W + 100} {y0:.0f}" fill="none" stroke="#ffffff" stroke-width="16" opacity=".45" filter="url(#b3)"/>'
    # Brilhos de pérola.
    for _ in range(40):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        r = rng.uniform(1, 3.4)
        body += f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r:.1f}" fill="#ffffff" opacity="{rng.uniform(0.4, 0.9):.2f}"/>'
    return svg(defs, body)


def natury() -> str:
    """Manhã no campo: colinas em camadas, névoa e galhos com folhas nas bordas."""
    rng = random.Random(12)
    defs = (
        '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
        '<stop offset="0" stop-color="#e7eedc"/><stop offset=".6" stop-color="#f3efd9"/>'
        '<stop offset="1" stop-color="#e9e4cc"/></linearGradient>'
        '<radialGradient id="sun"><stop offset="0" stop-color="#fff6d8"/>'
        '<stop offset=".35" stop-color="#f6e2a8" stop-opacity=".7"/><stop offset="1" stop-color="#f6e2a8" stop-opacity="0"/></radialGradient>'
        '<filter id="b30" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="30"/></filter>'
    )
    body = '<rect width="100%" height="100%" fill="url(#sky)"/>'
    body += '<circle cx="1320" cy="300" r="420" fill="url(#sun)"/>'
    layers = [
        (520, 50, 1.2, "#c9d6b4"),
        (600, 60, 1.6, "#adc196"),
        (690, 55, 1.1, "#8ea876"),
        (780, 70, 1.4, "#6f8f5a"),
        (880, 60, 0.9, "#557545"),
        (980, 50, 1.3, "#3f5f34"),
    ]
    for i, (base, amp, waves, color) in enumerate(layers):
        body += f'<path d="{smooth_ridge(rng, base, amp, waves)}" fill="{color}"/>'
        if i in (1, 3):
            body += f'<rect y="{base - 40}" width="100%" height="110" fill="#f5f2e2" opacity=".45" filter="url(#b30)"/>'
    # Fileira de árvores redondas numa das colinas.
    for _ in range(26):
        x = rng.uniform(0, W)
        y = 760 + rng.uniform(-30, 40)
        r = rng.uniform(14, 30)
        body += f'<ellipse cx="{x:.0f}" cy="{y - r:.0f}" rx="{r:.0f}" ry="{r * 1.15:.0f}" fill="#4d6c40" opacity=".85"/>'
        body += f'<rect x="{x - 2:.0f}" y="{y - 4:.0f}" width="4" height="{r * 0.6:.0f}" fill="#3a3a26" opacity=".6"/>'

    # Galhos com folhas entrando pelos cantos de cima.
    def branch(x0: float, y0: float, ang: float, length: float, side: int) -> str:
        out = ""
        x1 = x0 + length * math.cos(ang)
        y1 = y0 + length * math.sin(ang)
        out += f'<path d="M{x0:.0f} {y0:.0f} Q{(x0 + x1) / 2:.0f} {(y0 + y1) / 2 + 40:.0f} {x1:.0f} {y1:.0f}" stroke="#3f4a2c" stroke-width="5" fill="none" stroke-linecap="round"/>'
        for k in range(14):
            t = (k + 1) / 15
            px = x0 + (x1 - x0) * t
            py = y0 + (y1 - y0) * t + 40 * 4 * t * (1 - t) / 2
            a = ang + side * (0.9 + rng.uniform(-0.3, 0.3)) * (1 if k % 2 else -1)
            L = rng.uniform(34, 58) * (1.1 - t * 0.4)
            ex, ey = px + L * math.cos(a), py + L * math.sin(a)
            nx, ny = -(ey - py) * 0.32, (ex - px) * 0.32
            mx, my = (px + ex) / 2, (py + ey) / 2
            color = rng.choice(["#3f6b3a", "#4f7d44", "#5d8a4c", "#355d31"])
            out += f'<path d="M{px:.0f} {py:.0f} Q{mx + nx:.0f} {my + ny:.0f} {ex:.0f} {ey:.0f} Q{mx - nx:.0f} {my - ny:.0f} {px:.0f} {py:.0f}Z" fill="{color}" opacity=".9"/>'
        return out

    body += branch(-30, 40, 0.35, 520, 1)
    body += branch(W + 30, 10, math.pi - 0.42, 460, -1)
    return svg(defs, body)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, fn in (("ambar", ambar), ("esmeralda", esmeralda), ("perola", perola), ("natury", natury)):
        path = os.path.join(OUT, name + ".svg")
        with open(path, "w", encoding="utf-8") as f:
            f.write(fn())
        print(f"  {name}.svg  {os.path.getsize(path) / 1000:.1f} kB")
