#!/usr/bin/env python3
"""
Gera a biblioteca de música embutida do InkFlow (public/music/*.mp3).

Tudo é sintetizado aqui, sem amostras de terceiros:
  - Barroco: peças de domínio público (Bach, Petzold, Pachelbel), transcritas
    para este projeto e tocadas por síntese de cravo e cordas.
  - Chill, Foco: composições originais feitas para o InkFlow.
  - Ruído marrom, chuva e natureza: sons sintetizados (ruído filtrado,
    gotas, trovões, ondas, vento, pássaros, riacho).
Os arquivos gerados são dedicados ao domínio público (CC0 1.0), assim como
este script. Veja public/music/LICENSE.md.

Uso:  python3 scripts/music/render.py [id ...]     (precisa de numpy, scipy e ffmpeg)
Sem argumentos, gera todas as faixas. A saída é determinística (sementes fixas).
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, lfilter, oaconvolve, sosfilt

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "music")

# ---------------------------------------------------------------- utilidades


def secs(n: float) -> int:
    return int(round(n * SR))


def tl(n: int) -> np.ndarray:
    return np.arange(n) / SR


def midi(name: str) -> float:
    """'C#4' -> frequência (Hz)."""
    notes = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
    n = notes[name[0]]
    i = 1
    while i < len(name) and name[i] in "#b":
        n += 1 if name[i] == "#" else -1
        i += 1
    octave = int(name[i:])
    m = 12 * (octave + 1) + n
    return 440.0 * 2 ** ((m - 69) / 12)


def band(x: np.ndarray, lo: float | None, hi: float | None, order: int = 4) -> np.ndarray:
    if lo and hi:
        sos = butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    elif lo:
        sos = butter(order, lo, btype="high", fs=SR, output="sos")
    else:
        sos = butter(order, hi, btype="low", fs=SR, output="sos")
    return sosfilt(sos, x, axis=0)


def smooth_random(rng, n: int, rate: float, lo=0.0, hi=1.0) -> np.ndarray:
    """Curva aleatória lenta (rate em Hz), entre lo e hi."""
    k = max(4, int(n / SR * rate) + 4)
    pts = rng.random(k)
    x = np.linspace(0, k - 3, n)
    i = np.floor(x).astype(int)
    f = x - i
    f = f * f * (3 - 2 * f)
    y = pts[i] * (1 - f) + pts[i + 1] * f
    return lo + (hi - lo) * y


def brown(rng, n: int, leak=0.998) -> np.ndarray:
    w = rng.standard_normal(n)
    y = lfilter([1.0], [1.0, -leak], w)
    y = band(y, 18, None, 2)
    return y / (np.std(y) + 1e-9)


def pink(rng, n: int) -> np.ndarray:
    w = rng.standard_normal(n)
    # Filtro de Paul Kellet (aproximação de -3 dB/oitava).
    b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
    a = [1, -2.494956002, 2.017265875, -0.522189400]
    y = lfilter(b, a, w)
    return y / (np.std(y) + 1e-9)


def reverb(x: np.ndarray, rng, seconds=2.2, mix=0.25, damp=5000.0) -> np.ndarray:
    """Reverberação por convolução com uma resposta sintética (ruído que decai)."""
    n = secs(seconds)
    t = tl(n)
    out = np.zeros_like(x)
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-6.9 * t / seconds)
        ir = band(ir, None, damp, 2)
        ir[: secs(0.012)] = 0  # pré-atraso
        ir /= np.sqrt(np.sum(ir**2))
        out[:, ch] = oaconvolve(x[:, ch], ir)[: len(x)]
    return x * (1 - mix) + out * mix * 1.4


class Mix:
    def __init__(self, seconds: float):
        self.buf = np.zeros((secs(seconds), 2))

    def add(self, sig: np.ndarray, at: float, pan=0.0, gain=1.0):
        i = secs(at)
        if i >= len(self.buf):
            return
        sig = sig[: len(self.buf) - i]
        left = np.cos((pan + 1) * np.pi / 4) * gain
        right = np.sin((pan + 1) * np.pi / 4) * gain
        self.buf[i : i + len(sig), 0] += sig * left
        self.buf[i : i + len(sig), 1] += sig * right


def fade(x: np.ndarray, fin=0.02, fout=0.02) -> np.ndarray:
    a, b = secs(fin), secs(fout)
    if a:
        x[:a] *= np.linspace(0, 1, a)[:, None] if x.ndim == 2 else np.linspace(0, 1, a)
    if b:
        x[-b:] *= np.linspace(1, 0, b)[:, None] if x.ndim == 2 else np.linspace(1, 0, b)
    return x


def loopable(x: np.ndarray, length: float, xf=4.0) -> np.ndarray:
    """Corta em `length` s e funde o fim no começo: a faixa repete sem emenda."""
    n, k = secs(length), secs(xf)
    out = x[:n].copy()
    w = np.linspace(0, np.pi / 2, k)[:, None]
    out[:k] = x[:k] * np.sin(w) + x[n : n + k] * np.cos(w)
    return out


def master(x: np.ndarray, rms_db=-19.0, peak_db=-1.0) -> np.ndarray:
    x = x - np.mean(x, axis=0)
    rms = np.sqrt(np.mean(x**2)) + 1e-12
    x = x * (10 ** (rms_db / 20) / rms)
    peak = 10 ** (peak_db / 20)
    # Limitador suave: só age nos picos.
    over = np.abs(x) > peak * 0.8
    x[over] = np.sign(x[over]) * (peak * 0.8 + (peak * 0.2) * np.tanh((np.abs(x[over]) - peak * 0.8) / (peak * 0.2)))
    return x


def write(name: str, x: np.ndarray, bitrate="128k"):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + ".mp3")
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        tmp = f.name
    try:
        wavfile.write(tmp, SR, x.astype(np.float32))
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-codec:a", "libmp3lame",
             "-b:a", bitrate, "-ar", str(SR), "-map_metadata", "-1", path],
            check=True,
        )
    finally:
        os.unlink(tmp)
    print(f"  {name}.mp3  {len(x) / SR:6.1f} s  {os.path.getsize(path) / 1e6:5.2f} MB")


# ---------------------------------------------------------------- instrumentos


def harpsichord(f: float, dur: float, rng, vel=1.0) -> np.ndarray:
    """Cravo: parciais com decaimento rápido (os agudos somem antes) e o abafador ao soltar."""
    ring = min(dur + 0.35, 4.0)
    n = secs(ring)
    t = tl(n)
    y = np.zeros(n)
    pos = 0.12  # ponto onde a pena belisca a corda
    k = 1
    while k * f < 9000 and k <= 40:
        fk = k * f * np.sqrt(1 + 0.00003 * k * k)
        amp = abs(np.sin(np.pi * k * pos)) / k**0.7
        dec = 0.9 + 0.00055 * fk
        y += amp * np.exp(-dec * t) * np.sin(2 * np.pi * fk * t + rng.random() * 6.28)
        k += 1
    click = rng.standard_normal(secs(0.006)) * np.exp(-np.arange(secs(0.006)) / 40)
    y[: len(click)] += band(click, 1500, None, 2) * 0.3
    # Abafador: ao fim da nota o som cai rápido.
    d = secs(dur)
    if d < n:
        y[d:] *= np.exp(-(t[d:] - t[d]) * 18)
    y *= 1 - np.exp(-t / 0.0015)
    return y * 0.25 * vel


def strings(f: float, dur: float, rng, vel=1.0, bright=1.0) -> np.ndarray:
    """Cordas friccionadas: dente de serra com vibrato que entra devagar, duas vozes levemente desafinadas."""
    rel = 0.28
    n = secs(dur + rel)
    t = tl(n)
    out = np.zeros(n)
    for det in (-0.0017, 0.0017):
        vib = 0.0045 * np.minimum(1, t / 0.6) * np.sin(2 * np.pi * (5.3 + rng.random() * 0.5) * t + rng.random() * 6)
        ph = 2 * np.pi * np.cumsum(f * (1 + det) * (1 + vib)) / SR
        k = 1
        while k * f < 7000 * bright and k <= 30:
            out += np.sin(k * ph) / k * np.exp(-k * 0.06 / bright)
            k += 1
    att = np.minimum(1, t / 0.12)
    env = att * np.where(t < dur, 1.0, np.exp(-(t - dur) / (rel / 3)))
    # Arco: um pouco de ruído no ataque.
    noise = band(rng.standard_normal(n), 1500, 6000, 2) * np.exp(-t / 0.08) * 0.05
    return (out * 0.16 + noise) * env * vel


def rhodes(f: float, dur: float, rng, vel=1.0) -> np.ndarray:
    n = secs(dur + 1.2)
    t = tl(n)
    idx = 1.6 * np.exp(-t * 5) * vel + 0.25
    y = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
    y += 0.05 * np.sin(2 * np.pi * f * 14.2 * t) * np.exp(-t * 22)
    env = np.exp(-t * 0.9) * np.where(t < dur, 1.0, np.exp(-(t - dur) * 5))
    env *= 1 - np.exp(-t / 0.002)
    return y * env * 0.22 * vel


def pluck(f: float, dur: float, rng, vel=1.0) -> np.ndarray:
    """Harpa/violão suave: poucos harmônicos, decaimento longo."""
    n = secs(min(dur + 2.5, 6))
    t = tl(n)
    y = np.zeros(n)
    for k in range(1, 9):
        y += np.sin(2 * np.pi * k * f * t) / k**1.6 * np.exp(-t * (0.8 + 0.5 * k))
    y *= 1 - np.exp(-t / 0.003)
    return y * 0.25 * vel


def marimba(f: float, rng, vel=1.0) -> np.ndarray:
    n = secs(1.6)
    t = tl(n)
    y = np.sin(2 * np.pi * f * t) * np.exp(-t * 3.2)
    y += 0.3 * np.sin(2 * np.pi * f * 3.98 * t) * np.exp(-t * 14)
    y += 0.08 * np.sin(2 * np.pi * f * 9.9 * t) * np.exp(-t * 40)
    y *= 1 - np.exp(-t / 0.001)
    return y * 0.3 * vel


def pad(freqs: list[float], dur: float, rng, att=1.8, rel=2.5, bright=2200.0) -> np.ndarray:
    n = secs(dur + rel)
    t = tl(n)
    y = np.zeros(n)
    for f in freqs:
        for det in (-0.004, 0.0, 0.004):
            ph = 2 * np.pi * f * (1 + det) * t + rng.random() * 6.28
            for k in range(1, 12):
                y += np.sin(k * ph) / k
    y = band(y, None, bright, 2)
    env = np.minimum(1, t / att) * np.where(t < dur, 1.0, np.exp(-(t - dur) / (rel / 4)))
    return y * env * 0.04 / max(1, len(freqs)) ** 0.5


def bass(f: float, dur: float, rng, vel=1.0) -> np.ndarray:
    n = secs(dur + 0.3)
    t = tl(n)
    y = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)
    env = (1 - np.exp(-t / 0.01)) * np.exp(-t * 0.7) * np.where(t < dur, 1, np.exp(-(t - dur) * 20))
    return y * env * 0.35 * vel


# ---------------------------------------------------------------- Barroco


BWV846 = [
    "C4 E4 G4 C5 E5", "C4 D4 A4 D5 F5", "B3 D4 G4 D5 F5", "C4 E4 G4 C5 E5",
    "C4 E4 A4 E5 A5", "C4 D4 F#4 A4 D5", "B3 D4 G4 D5 G5", "B3 C4 E4 G4 C5",
    "A3 C4 E4 G4 C5", "D3 A3 D4 F#4 C5", "G3 B3 D4 G4 B4", "G3 Bb3 E4 G4 C#5",
    "F3 A3 D4 A4 D5", "F3 Ab3 D4 F4 B4", "E3 G3 C4 G4 C5", "E3 F3 A3 C4 F4",
    "D3 F3 A3 C4 F4", "G2 D3 G3 B3 F4", "C3 E3 G3 C4 E4", "C3 G3 Bb3 C4 E4",
    "F2 F3 A3 C4 E4", "F#2 C3 A3 C4 Eb4", "Ab2 F3 B3 C4 D4", "G2 F3 G3 B3 D4",
    "G2 E3 G3 C4 E4", "G2 D3 G3 C4 F4", "G2 D3 G3 B3 F4", "G2 Eb3 A3 C4 F#4",
    "G2 E3 G3 C4 G4", "G2 D3 G3 C4 F4", "G2 D3 G3 B3 F4", "C2 C3 G3 Bb3 E4",
]


def bach_prelude():
    rng = np.random.default_rng(846)
    s16 = 60 / 66 / 4
    total = (len(BWV846) + 3) * 16 * s16 + 6
    m = Mix(total)
    t = 0.0
    for bar in BWV846:
        a, b, c, d, e = bar.split()
        for half in range(2):
            seq = [a, b, c, d, e, c, d, e]
            for i, note in enumerate(seq):
                held = 8 if i == 0 else 7 if i == 1 else 1.6
                m.add(harpsichord(midi(note), held * s16, rng, 0.9 if i > 1 else 1.0),
                      t, pan=-0.25 + 0.1 * i, gain=1.0)
                t += s16
    # Compassos finais (pedal de Dó), com um leve ritardando.
    ends = [
        "C2 C3 F3 A3 C4 F4 C4 A3 C4 A3 F3 A3 F3 D3 F3 D3",
        "C2 B2 G4 B4 D5 F5 D5 B4 D5 B4 G4 B4 D4 F4 E4 D4",
    ]
    for j, run in enumerate(ends):
        for i, note in enumerate(run.split()):
            step = s16 * (1 + 0.04 * j + 0.03 * i * j)
            held = 16 if i == 0 else 1.8
            m.add(harpsichord(midi(note), held * s16, rng), t, pan=-0.2 + 0.03 * i)
            t += step
    for k, note in enumerate(["C2", "C3", "E4", "G4", "C5"]):
        m.add(harpsichord(midi(note), 3.5, rng), t + k * 0.035, pan=-0.3 + 0.15 * k)
    x = reverb(m.buf, rng, 2.4, 0.22)
    x = fade(x[: secs(t + 4.5)], 0.01, 1.5)
    return master(x, -19)


def parse(seq: str) -> list[tuple[str | None, float]]:
    """'D5:1 G4:.5 r:1' -> [(nota, tempos)]; 'r' é pausa."""
    out = []
    for tok in seq.split():
        n, d = tok.split(":")
        out.append((None if n == "r" else n, float(d)))
    return out


MINUET_A = (
    "D5:1 G4:.5 A4:.5 B4:.5 C5:.5 D5:1 G4:1 G4:1 E5:1 C5:.5 D5:.5 E5:.5 F#5:.5 G5:1 G4:1 G4:1 "
    "C5:1 D5:.5 C5:.5 B4:.5 A4:.5 B4:1 C5:.5 B4:.5 A4:.5 G4:.5 F#4:1 G4:.5 A4:.5 B4:.5 G4:.5 A4:3 "
    "D5:1 G4:.5 A4:.5 B4:.5 C5:.5 D5:1 G4:1 G4:1 E5:1 C5:.5 D5:.5 E5:.5 F#5:.5 G5:1 G4:1 G4:1 "
    "C5:1 D5:.5 C5:.5 B4:.5 A4:.5 B4:1 C5:.5 B4:.5 A4:.5 G4:.5 A4:1 B4:.5 A4:.5 G4:.5 F#4:.5 G4:3"
)
MINUET_A_BASS = (
    "G3:2 A3:1 B3:3 C4:3 B3:3 A3:3 G3:3 D4:1 B3:1 G3:1 D4:1 D3:.5 C4:.5 B3:.5 A3:.5 "
    "B3:2 A3:1 G3:1 B3:1 G3:1 C4:3 B3:1 C4:.5 B3:.5 A3:.5 G3:.5 A3:2 F#3:1 G3:2 B3:1 C4:1 D4:1 D3:1 G3:2 G2:1"
)
MINUET_B = (
    "B5:1 G5:.5 A5:.5 B5:.5 G5:.5 A5:1 D5:.5 E5:.5 F#5:.5 D5:.5 G5:1 E5:.5 F#5:.5 G5:.5 D5:.5 "
    "C#5:1 B4:.5 C#5:.5 A4:1 A4:.5 B4:.5 C#5:.5 D5:.5 E5:.5 F#5:.5 G5:1 F#5:1 E5:1 F#5:1 A4:1 C#5:1 D5:3 "
    "D5:1 G4:.5 F#4:.5 G4:1 E5:1 G4:.5 F#4:.5 G4:1 D5:1 C5:1 B4:1 A4:.5 G4:.5 F#4:.5 G4:.5 A4:1 "
    "D4:.5 E4:.5 F#4:.5 G4:.5 A4:.5 B4:.5 C5:1 B4:1 A4:1 B4:.5 D5:.5 G4:1 F#4:1 G4:3"
)
MINUET_B_BASS = (
    "G3:3 F#3:3 E3:3 G3:1 A3:1 A2:1 F#3:3 G3:3 A3:3 D3:1 D4:1 C4:1 "
    "B3:3 C4:3 B3:1 A3:1 G3:1 D4:2 D3:1 C3:3 B2:1 C3:1 A2:1 D3:3 G2:3"
)


def play_line(m: Mix, line, beat: float, t0: float, inst, rng, pan=0.0, gain=1.0, legato=1.0):
    t = t0
    for note, d in line:
        if note:
            m.add(inst(midi(note), d * beat * legato, rng), t, pan=pan, gain=gain)
        t += d * beat
    return t


def minuet():
    rng = np.random.default_rng(114)
    beat = 60 / 112
    a, ab, b, bb = parse(MINUET_A), parse(MINUET_A_BASS), parse(MINUET_B), parse(MINUET_B_BASS)
    la = sum(d for _, d in a)
    lb = sum(d for _, d in b)
    m = Mix((la * 2 + lb * 2) * beat + 6)
    t = 0.0
    for line, low, length in ((a, ab, la), (a, ab, la), (b, bb, lb), (b, bb, lb)):
        play_line(m, line, beat, t, harpsichord, rng, pan=0.2, gain=1.0, legato=0.9)
        play_line(m, low, beat, t, harpsichord, rng, pan=-0.25, gain=0.8, legato=0.95)
        t += length * beat
    x = reverb(m.buf, rng, 2.0, 0.2)
    x = fade(x[: secs(t + 3.5)], 0.01, 1.2)
    return master(x, -19)


CANON_BASS = ["D3", "A2", "B2", "F#2", "G2", "D2", "G2", "A2"]
CANON_CHORDS = [
    ["F#4", "A4", "D5"], ["E4", "A4", "C#5"], ["F#4", "B4", "D5"], ["F#4", "A4", "C#5"],
    ["G4", "B4", "D5"], ["F#4", "A4", "D5"], ["G4", "B4", "D5"], ["E4", "A4", "C#5"],
]
CANON_VARS = [
    "F#5:1 E5:1 D5:1 C#5:1 B4:1 A4:1 B4:1 C#5:1",
    "D5:.5 F#5:.5 A5:.5 G5:.5 F#5:.5 D5:.5 F#5:.5 E5:.5 D5:.5 B4:.5 D5:.5 A5:.5 G5:.5 B5:.5 A5:.5 G5:.5",
    "F#5:.5 A5:.5 E5:.5 A5:.5 D5:.5 F#5:.5 C#5:.5 F#5:.5 B4:.5 D5:.5 A4:.5 D5:.5 B4:.5 D5:.5 C#5:.5 E5:.5",
    "D5:.25 F#5:.25 A5:.25 F#5:.25 C#5:.25 E5:.25 A5:.25 E5:.25 B4:.25 D5:.25 F#5:.25 D5:.25 "
    "A4:.25 C#5:.25 F#5:.25 C#5:.25 B4:.25 D5:.25 G5:.25 D5:.25 A4:.25 D5:.25 F#5:.25 D5:.25 "
    "B4:.25 D5:.25 G5:.25 B5:.25 A5:.25 G5:.25 E5:.25 C#5:.25",
    "F#5:.5 G5:.5 A5:.5 E5:.5 F#5:.5 D5:.5 C#5:.5 A4:.5 B4:.5 G4:.5 A4:.5 F#4:.5 G4:.5 B4:.5 A4:.5 C#5:.5",
    "D5:1 C#5:1 D5:.75 B4:.25 C#5:1 B4:1 A4:.75 F#4:.25 G4:.5 B4:.5 A4:1",
    "A5:2 F#5:2 G5:1 F#5:1 G5:1 E5:1",
    "F#5:1 E5:1 D5:1 C#5:1 B4:1 A4:1 B4:1 C#5:1",
]


def canon():
    rng = np.random.default_rng(1680)
    beat = 60 / 58
    # As variações e depois uma segunda volta, em outra ordem, até o fecho.
    order = list(range(len(CANON_VARS))) + [2, 4, 3, 5, 1, 6, 0]
    seq = [parse(CANON_VARS[i]) for i in order]
    cycles = 1 + len(seq)
    m = Mix(cycles * 8 * beat + 8)
    # Baixo contínuo (violoncelo) e acordes do cravo.
    for c in range(cycles):
        for i, note in enumerate(CANON_BASS):
            t = (c * 8 + i) * beat
            m.add(strings(midi(note), beat * 0.96, rng, 0.9, 0.7), t, pan=-0.35, gain=1.0)
            if c > 0:
                for k, cn in enumerate(CANON_CHORDS[i]):
                    m.add(harpsichord(midi(cn) / 2, beat * 0.5, rng, 0.45), t + k * 0.012, pan=0.35)
    # Três violinos em cânone: cada um entra um ciclo depois do anterior.
    for v, (pan, gain) in enumerate(((-0.15, 0.9), (0.45, 0.75), (-0.55, 0.7))):
        t = (1 + v) * 8 * beat
        for line in seq[: len(seq) - v] if v else seq:
            t = play_line(m, line, beat, t, lambda f, d, r: strings(f, d, r, 0.85), rng, pan, gain, 0.97)
    end = cycles * 8 * beat
    for k, note in enumerate(["D2", "D3", "A3", "F#4", "D5"]):
        m.add(strings(midi(note), 3.5, rng, 0.8, 0.8), end + k * 0.02, pan=-0.4 + 0.2 * k, gain=0.9)
    x = reverb(m.buf, rng, 2.8, 0.3)
    x = fade(x[: secs(end + 6)], 0.3, 2.5)
    return master(x, -19)


# ---------------------------------------------------------------- Chill & Foco (originais)


def chord(names: str) -> list[float]:
    return [midi(n) for n in names.split()]


def kick(rng) -> np.ndarray:
    n = secs(0.35)
    t = tl(n)
    f = 45 + 40 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * 0.6


def brush(rng, dur=0.18) -> np.ndarray:
    n = secs(dur)
    t = tl(n)
    return band(rng.standard_normal(n), 1800, 7000, 2) * np.exp(-t * 18) * 0.12


def hat(rng) -> np.ndarray:
    n = secs(0.05)
    t = tl(n)
    return band(rng.standard_normal(n), 7000, None, 2) * np.exp(-t * 90) * 0.06


def crackle(rng, n: int) -> np.ndarray:
    x = np.zeros(n)
    pos = rng.integers(0, n, int(n / SR * 9))
    x[pos] = rng.standard_normal(len(pos)) * 0.25
    x = band(x, 1200, 7000, 2)
    return x + band(pink(rng, n), 200, 4000, 2) * 0.004


def entardecer():
    rng = np.random.default_rng(76)
    beat = 60 / 74
    prog = ["F3 A3 C4 E4", "E3 G3 B3 D4", "D3 F3 A3 C4", "C3 E3 G3 B3"]
    roots = ["F2", "E2", "D2", "C2"]
    scale = ["C5", "D5", "E5", "G5", "A5", "C6"]
    bars = 48
    m = Mix(bars * 4 * beat + 6)
    for bar in range(bars):
        t = bar * 4 * beat
        ci = bar % 4
        intro = bar < 4
        for k, f in enumerate(chord(prog[ci])):
            m.add(rhodes(f, beat * 1.4, rng, 0.85), t + k * 0.01, pan=-0.2 + 0.13 * k)
            m.add(rhodes(f, beat * 0.9, rng, 0.6), t + 2.5 * beat + k * 0.01, pan=-0.2 + 0.13 * k)
        if not intro:
            m.add(bass(midi(roots[ci]), beat * 1.6, rng), t, gain=1.0)
            m.add(bass(midi(roots[ci]), beat * 0.4, rng, 0.7), t + 3.5 * beat)
            for b in (0, 2):
                m.add(kick(rng), t + b * beat, gain=0.8)
            for b in (1, 3):
                m.add(brush(rng), t + b * beat, pan=0.1)
            for e in range(8):
                m.add(hat(rng), t + e * beat / 2 + (0.03 if e % 2 else 0), pan=0.3, gain=0.8 + 0.4 * (e % 2))
        # Melodia pentatônica: frases curtas, compasso sim, compasso não.
        if bar % 2 == 1 and 4 <= bar < bars - 2:
            n = rng.integers(3, 6)
            pos = sorted(rng.choice(np.arange(8), size=n, replace=False))
            for p in pos:
                note = scale[int(rng.integers(0, len(scale)))]
                m.add(rhodes(midi(note), beat * 0.8, rng, 0.7), t + p * beat / 2, pan=0.25)
    x = m.buf
    x[:, 0] += crackle(rng, len(x))
    x[:, 1] += crackle(rng, len(x))
    x = reverb(x, rng, 1.8, 0.2, 4500)
    x = band(x, None, 9000, 2)
    return master(fade(x[: secs(bars * 4 * beat + 3)], 0.5, 3), -20)


def brisa():
    rng = np.random.default_rng(64)
    beat = 60 / 62
    prog = [("C3 G3 D4 E4", "C4 E4 G4 B4 D5 B4 G4 E4"), ("A2 E3 B3 C4", "A3 C4 E4 G4 B4 G4 E4 C4"),
            ("F2 C3 G3 A3", "F3 A3 C4 E4 G4 E4 C4 A3"), ("G2 D3 A3 B3", "G3 B3 D4 E4 A4 E4 D4 B3")]
    bars = 36
    m = Mix(bars * 4 * beat + 8)
    for bar in range(bars):
        t = bar * 4 * beat
        harm, arp = prog[(bar // 2) % 4]
        if bar % 2 == 0:
            m.add(pad(chord(harm), 8 * beat, rng, 2.5, 3.5), t, gain=1.0)
        if bar >= 2:
            for i, note in enumerate(arp.split()):
                m.add(pluck(midi(note), beat, rng, 0.75 + 0.1 * (i % 2)), t + i * beat / 2,
                      pan=-0.4 + 0.1 * i)
    x = reverb(m.buf, rng, 3.2, 0.38, 4000)
    return master(fade(x[: secs(bars * 4 * beat + 5)], 1.5, 5), -21)


def pulso():
    rng = np.random.default_rng(100)
    e = 60 / 100 / 2
    pattern = ["D4", "A4", "E4", "F4", "A4", "D5", "C5", "A4"]
    swaps = ["G4", "E5", "F4", "C5", "D5", "A4", "E4", "G4"]
    bars = 64
    m = Mix(bars * 8 * e + 8)
    pat = list(pattern)
    for bar in range(bars):
        if bar and bar % 6 == 0:
            i = (bar // 6) % 8
            pat[i] = swaps[i] if pat[i] == pattern[i] else pattern[i]
        t = bar * 8 * e
        for i, note in enumerate(pat):
            m.add(marimba(midi(note), rng, 0.8 + 0.2 * (i % 4 == 0)), t + i * e, pan=-0.3 + 0.08 * i)
            if bar >= 16 and i % 2 == 0:
                # Segunda voz atrasada meio tempo, uma oitava abaixo (defasagem à la Reich).
                m.add(marimba(midi(note) / 2, rng, 0.5), t + i * e + e / 2, pan=0.35)
        if bar % 8 == 0:
            m.add(pad(chord("D2 A2 E3"), 8 * 8 * e, rng, 3, 4, 1200), t, gain=0.8)
    x = reverb(m.buf, rng, 2.2, 0.25)
    return master(fade(x[: secs(bars * 8 * e + 4)], 1, 4), -21)


def nevoa():
    rng = np.random.default_rng(7)
    chords = ["D3 A3 E4 F#4", "B2 F#3 C#4 D4", "G2 D3 A3 B3", "A2 E3 B3 C#4", "D3 A3 E4 A4", "E3 B3 F#4 G4"]
    step = 15.0
    m = Mix(len(chords) * 2 * step + 12)
    for i in range(len(chords) * 2):
        c = chords[i % len(chords)]
        m.add(pad(chord(c), step + 4, rng, 5, 7, 1600), i * step, gain=1.0)
        # Brilho: notas altas esparsas.
        for _ in range(3):
            note = c.split()[int(rng.integers(0, 4))]
            m.add(pluck(midi(note) * 4, 1, rng, 0.25), i * step + rng.random() * step, pan=rng.random() * 1.6 - 0.8)
    x = reverb(m.buf, rng, 4.5, 0.5, 3000)
    return master(fade(x[: secs(len(chords) * 2 * step + 8)], 4, 8), -22)


# ---------------------------------------------------------------- ruídos e ambientes (em loop)

LOOP = 80.0
XF = 5.0


def stereo(l: np.ndarray, r: np.ndarray) -> np.ndarray:
    return np.stack([l, r], axis=1)


def brown_noise(soft=False):
    rng = np.random.default_rng(11 if soft else 10)
    n = secs(LOOP + XF)
    chans = []
    for _ in range(2):
        y = brown(rng, n, 0.9985 if soft else 0.997)
        if soft:
            y = band(y, None, 350, 2)
        chans.append(y)
    x = stereo(*chans)
    return master(loopable(x, LOOP, XF), -21 if soft else -20)


def drops(rng, n: int, rate: float, freqs, decay=(0.002, 0.008), amp=1.0) -> np.ndarray:
    """Gotas: trens de impulsos esparsos convolvidos com 'plics' curtos."""
    out = np.zeros(n)
    for f in freqs:
        x = np.zeros(n)
        k = int(n / SR * rate / len(freqs))
        pos = rng.integers(0, n, k)
        x[pos] = rng.lognormal(0, 0.7, k)
        tau = decay[0] + rng.random() * (decay[1] - decay[0])
        m = secs(tau * 6)
        tt = tl(m)
        kern = np.sin(2 * np.pi * f * tt * (1 + 0.3 * np.exp(-tt / tau))) * np.exp(-tt / tau)
        out += oaconvolve(x, kern)[:n]
    return out * amp


def rain(kind: str):
    seed = {"leve": 20, "forte": 21, "janela": 22, "tempestade": 23}[kind]
    rng = np.random.default_rng(seed)
    n = secs(LOOP + XF)
    chans = []
    for ch in range(2):
        hiss = band(pink(rng, n), 400 if kind != "janela" else 250, 9000 if kind != "janela" else 2600, 2)
        sway = smooth_random(rng, n, 0.15, 0.75, 1.0)
        if kind == "leve":
            y = hiss * 0.12 * sway + band(drops(rng, n, 180, [2600, 3400, 4300, 5200]), 900, None, 2) * 0.05
        elif kind in ("forte", "tempestade"):
            low = band(brown(rng, n), 60, 400, 2) * 0.18
            y = hiss * 0.3 * sway + low + band(drops(rng, n, 900, [1800, 2500, 3300, 4200, 5600]), 700, None, 2) * 0.05
        else:  # janela: chuva abafada lá fora e gotas batendo no vidro
            taps = drops(rng, n, 22, [900, 1250, 1600, 2100], (0.004, 0.012))
            runs = drops(rng, n, 160, [3000, 3800], (0.001, 0.003)) * 0.25
            y = hiss * 0.16 * sway + band(taps, 500, 5000, 2) * 0.09 + band(runs, 1500, None, 2) * 0.05
        chans.append(y)
    x = stereo(*chans)
    if kind == "tempestade":
        for at in (6.0, 27.0, 49.0, 68.0):
            at += rng.random() * 3
            dur = 7 + rng.random() * 4
            m = secs(dur)
            t = tl(m)
            env = np.zeros(m)
            for c, w in ((0.6, 0.5), (1.8, 1.2), (3.2, 1.8)):
                env += np.exp(-((t - c - rng.random() * 0.6) ** 2) / (2 * w**2)) * (0.6 + rng.random() * 0.6)
            env *= np.exp(-t / (dur / 2.5))
            rumble = band(brown(rng, m), 25, 140, 2) * env * 1.2
            crack = band(rng.standard_normal(m), 250, 3500, 2) * np.exp(-t / 0.12) * 0.25
            crack[: secs(0.25)] *= np.linspace(0, 1, secs(0.25)) ** 0.5
            th = rumble + crack * (rng.random() > 0.4)
            i = secs(at)
            pan = rng.random() * 1.2 - 0.6
            x[i : i + m, 0] += th[: len(x) - i] * np.cos((pan + 1) * np.pi / 4) * 1.4
            x[i : i + m, 1] += th[: len(x) - i] * np.sin((pan + 1) * np.pi / 4) * 1.4
    level = {"leve": -24, "forte": -19, "janela": -23, "tempestade": -19}[kind]
    return master(loopable(x, LOOP, XF), level)


def bird_phrase(rng, species: int) -> np.ndarray:
    """Um canto curto: sequência de 'piu' (varreduras de frequência), às vezes com trinado."""
    base = [3200, 4200, 2600, 5200][species]
    count = int(rng.integers(3, 8))
    parts = []
    for i in range(count):
        d = 0.05 + rng.random() * 0.1
        m = secs(d)
        t = tl(m)
        f0 = base * (0.85 + rng.random() * 0.3)
        f1 = f0 * (0.7 + rng.random() * 0.8)
        f = f0 + (f1 - f0) * (t / d)
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) ** 2
        if species == 2:
            y *= 0.6 + 0.4 * np.sin(2 * np.pi * 45 * t)
        parts.append(y)
        parts.append(np.zeros(secs(0.04 + rng.random() * 0.12)))
    return np.concatenate(parts) * 0.12


def nature(kind: str):
    seed = {"floresta": 30, "mar": 31, "vento": 32, "riacho": 33}[kind]
    rng = np.random.default_rng(seed)
    n = secs(LOOP + XF)
    x = np.zeros((n, 2))
    if kind == "mar":
        bands = [(None, 350, 0.7, 0.9), (350, 1800, 1.4, 0.5), (1800, 7000, 3.0, 0.22)]
        envs = [np.zeros(n) for _ in range(2)]
        t = 0.0
        while t < LOOP + XF:
            period = 7 + rng.random() * 5
            m = secs(period * 1.6)
            tt = tl(m)
            rise, peak = period * 0.38, period * 0.42
            e = np.where(tt < rise, (tt / rise) ** 2, np.exp(-(tt - rise) / (period * 0.35)))
            e *= 0.7 + rng.random() * 0.5
            pan = rng.random()
            i = secs(t)
            for ch, g in ((0, 1 - pan * 0.6), (1, 0.4 + pan * 0.6)):
                seg = envs[ch][i : i + m]
                seg += e[: len(seg)] * g
            t += period * (0.75 + rng.random() * 0.35)
        for ch in range(2):
            env = np.clip(envs[ch], 0, 1.6)
            base_noise = pink(rng, n)
            for lo, hi, power, gain in bands:
                x[:, ch] += band(base_noise, lo, hi, 2) * (env**power) * gain
            x[:, ch] += band(brown(rng, n), 30, 200, 2) * 0.12
        level = -21
    elif kind == "vento":
        for ch in range(2):
            gust = smooth_random(rng, n, 0.12, 0.2, 1.0) ** 1.5
            x[:, ch] += band(brown(rng, n), 40, 300, 2) * gust * 0.5
            x[:, ch] += band(pink(rng, n), 300, 1400, 2) * gust**2 * 0.35
            x[:, ch] += band(pink(rng, n), 1400, 5000, 2) * gust**3 * 0.12
            for f in (620, 880, 1240):
                whistle = band(rng.standard_normal(n), f * 0.97, f * 1.03, 2)
                x[:, ch] += whistle * smooth_random(rng, n, 0.08, 0, 1) ** 3 * gust * 0.5
        level = -21
    elif kind == "floresta":
        for ch in range(2):
            leaves = smooth_random(rng, n, 0.1, 0.3, 1.0)
            x[:, ch] += band(pink(rng, n), 1500, 7000, 2) * leaves**2 * 0.08
            x[:, ch] += band(brown(rng, n), 50, 400, 2) * 0.05
        t = 1.0
        while t < LOOP - 2:
            ph = bird_phrase(rng, int(rng.integers(0, 4)))
            pan = rng.random() * 1.6 - 0.8
            far = 0.35 + rng.random() * 0.65
            i = secs(t)
            seg = ph[: n - i]
            x[i : i + len(seg), 0] += seg * np.cos((pan + 1) * np.pi / 4) * far
            x[i : i + len(seg), 1] += seg * np.sin((pan + 1) * np.pi / 4) * far
            t += 1.2 + rng.random() * 4.5
        x = reverb(x, rng, 1.6, 0.3, 6000)
        level = -24
    else:  # riacho
        for ch in range(2):
            x[:, ch] += band(pink(rng, n), 250, 3500, 2) * smooth_random(rng, n, 3, 0.5, 1.0) * 0.35
            blips = np.zeros(n)
            for _ in range(int(LOOP * 45)):
                d = 0.015 + rng.random() * 0.05
                m = secs(d)
                tt = tl(m)
                f0 = 350 + rng.random() * 1100
                f = f0 * (1 + 1.8 * tt / d)
                y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / (d / 3)) * (1 - np.exp(-tt / 0.002))
                i = int(rng.integers(0, n - m))
                blips[i : i + m] += y * rng.lognormal(-1.2, 0.6)
            x[:, ch] += band(blips, 250, 4000, 2) * 0.5
        level = -22
    return master(loopable(x, LOOP, XF), level)


# ---------------------------------------------------------------- catálogo

TRACKS = {
    "bach-preludio-bwv846": (bach_prelude, "128k"),
    "minueto-em-sol": (minuet, "128k"),
    "canone-pachelbel": (canon, "128k"),
    "entardecer": (entardecer, "128k"),
    "brisa": (brisa, "128k"),
    "pulso": (pulso, "128k"),
    "nevoa": (nevoa, "128k"),
    "ruido-marrom": (lambda: brown_noise(False), "96k"),
    "ruido-marrom-suave": (lambda: brown_noise(True), "96k"),
    "chuva-leve": (lambda: rain("leve"), "96k"),
    "chuva-forte": (lambda: rain("forte"), "96k"),
    "chuva-na-janela": (lambda: rain("janela"), "96k"),
    "tempestade": (lambda: rain("tempestade"), "96k"),
    "floresta": (lambda: nature("floresta"), "96k"),
    "ondas-do-mar": (lambda: nature("mar"), "96k"),
    "vento": (lambda: nature("vento"), "96k"),
    "riacho": (lambda: nature("riacho"), "96k"),
}

if __name__ == "__main__":
    wanted = sys.argv[1:] or list(TRACKS)
    for name in wanted:
        fn, rate = TRACKS[name]
        write(name, fn(), rate)
