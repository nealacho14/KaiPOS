# @kaipos/ui

Design system del monorepo. Tema MUI v7 + Emotion con CSS variables (light/dark), tokens propios y un puñado de componentes custom (`KaiPOSLogo`, `ColorSchemeToggle`). Todo el resto se re-exporta desde `@mui/material` y `lucide-react` para que las apps **nunca** importen de esos paquetes directamente.

## Importar

```ts
import { Box, Button, Typography, useTheme, useMediaQuery, Plus } from '@kaipos/ui';
import { kaiPOSTheme } from '@kaipos/ui'; // o desde '@kaipos/ui/theme'
import { brand, colors, radius, spacing } from '@kaipos/ui'; // tokens
```

Subpaths disponibles: `@kaipos/ui`, `@kaipos/ui/theme`, `@kaipos/ui/tokens`, `@kaipos/ui/providers`, `@kaipos/ui/components`, `@kaipos/ui/icons`.

## Reglas duras

- En `apps/**/src` **nunca** importar de `@mui/material`, `@mui/material/*` ni `lucide-react`. Pasa por `@kaipos/ui`.
- En `apps/**/src` **nunca** usar `fontSize`, `fontWeight` o `borderRadius` numéricos en `sx`/`style`. Usar variantes de Typography y `theme.radii.*`.
- Spacing siempre vía la escala MUI (`p={2}`, `m={3}`, `gap={1.5}`, `theme.spacing(n)`); nunca strings con `px`.
- Colores siempre vía `palette.*` o `colors.*` de tokens; nunca hex/rgb literales.

## Tokens de tipografía → variantes

Usar `<Typography variant="...">`. Para componentes que no son `<Typography>` (Avatar, ListItemText slotProps, etc.), spread del estilo: `sx={{ ...theme.typography.subtitle2 }}`.

| Combinación común                 | Variante a usar                                  |
| --------------------------------- | ------------------------------------------------ |
| `fontSize: 11` + bold + uppercase | `overline`                                       |
| `fontSize: 12` + medium           | `caption`                                        |
| `fontSize: 13` + regular          | `body2`                                          |
| `fontSize: 14` + medium (550)     | `subtitle2`                                      |
| `fontSize: 15` + regular          | `body1`                                          |
| `fontSize: 15` + semibold (600)   | `button`                                         |
| `fontSize: 16` + medium           | `subtitle1`                                      |
| `fontSize: 17`                    | `h5`                                             |
| `fontSize: 20`                    | `h4`                                             |
| `fontSize: 26`                    | `h3`                                             |
| `fontSize: 34`                    | `h2`                                             |
| `fontSize: 44`                    | `h1`                                             |
| Money / order IDs                 | `mono`, `money`, `moneyLg`, `moneyXl`, `orderId` |

## Otros tokens

- **Radii** — `theme.radii.xs (4) | sm (6) | md (10) | lg (14) | xl (20) | pill (999)`. `theme.shape.borderRadius` por defecto = `radii.md`.
- **Spacing** — escala 4 px. `theme.spacing(n)` o `sx={{ p: n }}`. Tokens crudos en `spacing` (`{ 0,1,2,3,4,5,6,8,10,12,16,20,24 }`).
- **Touch** — `theme.posSize.{ min: 48, pos: 56, kds: 64, desktop: 36, dense: 32 }`.
- **Shadows** — `theme.shadowTokens.{ none, xs, sm, md, lg, xl, focus, inset }` o `elevation={n}` en MUI.
- **Z-index** — `theme.zIndex.*` (estándar MUI).
- **Breakpoints** — `xs: 0, sm: 600, md: 960, lg: 1280, xl: 1600`. Helpers `theme.breakpoints.up('md')` y `useMediaQuery`.
- **Safe area** — `theme.safeArea.{ top, right, bottom, left }`. Envuelven `env(safe-area-inset-*)` con fallback `0px`, así que son inertes fuera de una PWA instalada. Nunca escribas `env(...)` a mano en `sx`.

## Responsive

Tres modos, vía `useLayoutMode()` de `@kaipos/ui`:

| Modo      | Regla                        | Ejemplo                          |
| --------- | ---------------------------- | -------------------------------- |
| `phone`   | el resto                     | teléfono; y horizontal (932×430) |
| `tablet`  | ancho ≥ 720 **y** alto ≥ 600 | iPad vertical (768×1024)         |
| `desktop` | `up('md')` → ancho ≥ 960     | iPad horizontal (1024), laptop   |

La cláusula de alto no es opcional: un teléfono grande en horizontal supera
cualquier umbral de ancho razonable, y darle un layout de dos paneles lo deja
con ~366 px útiles bajo el header. El ancho solo no distingue una tablet de un
teléfono acostado.

**Cuándo usar cuál:**

- `useLayoutMode()` cuando **cambia el árbol de componentes** (un panel fijo vs.
  un drawer, una sidebar permanente vs. temporal).
- Objetos de breakpoint en `sx` (`p={{ xs: 2, md: 4 }}`) cuando solo **escala el
  estilo**. Son width-only — por eso no pueden expresar la regla de alto de
  arriba, y por eso el modo tablet no es una clave de breakpoint.

**Reglas:**

- Mobile-first: el valor base es el de teléfono, los breakpoints suben.
- Nunca `100vh` — usa `100dvh`. `vh` no descuenta la barra de direcciones
  colapsable del navegador móvil y corta el contenido.
- En el POS, todo objetivo táctil ≥ `theme.posSize.min` (48 px, piso WCAG 2.5.5).

Para tests, `@kaipos/ui/testing` expone `setViewport` / `VIEWPORT` /
`resetViewport`. happy-dom tiene un motor real de media queries, así que las
ramas responsive se ejercitan de verdad en lugar de mockear `matchMedia`. Ojo:
`renderHook` debe envolverse en `<KaiPOSThemeProvider>` — sin él, `useTheme()`
cae al tema por defecto de MUI, cuyo `md` es 900 y no 960.

## Color scheme

`<KaiPOSThemeProvider>` envuelve `CssVarsProvider` y persiste la elección. Toggle con `<ColorSchemeToggle />`. Custom hook `useColorScheme()` re-exportado.

## Variantes custom (typed)

- `<Button size="pos" | "kds" />`, `<Button variant="tile" | "danger" />`
- `<Card variant="raised" | "ticket" />`
- `<Typography variant="mono" | "money" | "moneyLg" | "moneyXl" | "orderId" />`
