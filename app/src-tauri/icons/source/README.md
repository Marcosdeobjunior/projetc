# Marca da Tália

- `original-logo.jpg` e `original-mark.webp`: as imagens originais do logo (com e sem o nome).
- `talia-mark.svg`: o símbolo (árvore branca no círculo amarelo `#ECBF1F`) redesenhado em vetor a
  partir de `original-mark.webp`. É o mesmo desenho do componente `TaliaMark`
  (`src/ui/Icon.tsx`), do `public/favicon.svg` e do site.
- `talia-logo.png`: o logo completo (símbolo + "Tália" em EB Garamond, cor `#A75634`) em
  1024 × 1024, com fundo transparente. É a fonte dos ícones do app.

Para gerar de novo os ícones (`icons/*.png`, `icon.ico`, `icon.icns`, `Square*Logo.png`), em `app/`:

```bash
pnpm tauri icon src-tauri/icons/source/talia-logo.png
```

O comando também cria as pastas `android/` e `ios/`, que o app não usa e podem ser apagadas.
