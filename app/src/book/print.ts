/** Imprime uma imagem do tamanho exato da página (ex.: a capa aberta para a gráfica). */
export async function printImage(canvas: HTMLCanvasElement, widthMm: number, heightMm: number) {
  const url = URL.createObjectURL(
    await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png")),
  );
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  frame.srcdoc = `<!doctype html><html><head><style>
@page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
html, body { margin: 0; }
img { display: block; width: ${widthMm}mm; height: ${heightMm}mm; }
</style></head><body><img src="${url}"></body></html>`;
  document.body.append(frame);
  try {
    await new Promise<void>((r) => frame.addEventListener("load", () => r(), { once: true }));
    const win = frame.contentWindow!;
    await win.document.images[0]?.decode().catch(() => null);
    win.focus();
    win.print();
  } finally {
    setTimeout(() => {
      frame.remove();
      URL.revokeObjectURL(url);
    }, 1000);
  }
}
