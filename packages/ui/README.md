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

## Color scheme

`<KaiPOSThemeProvider>` envuelve `CssVarsProvider` y persiste la elección. Toggle con `<ColorSchemeToggle />`. Custom hook `useColorScheme()` re-exportado.

## Variantes custom (typed)

- `<Button size="pos" | "kds" />`, `<Button variant="tile" | "danger" />`
- `<Card variant="raised" | "ticket" />`
- `<Typography variant="mono" | "money" | "moneyLg" | "moneyXl" | "orderId" />`
