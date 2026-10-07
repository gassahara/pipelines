# COLOR-UTILITIES

> Project: **FRAMEWORK**
> The framework's colour derivation primitives.

Source: `./js/factory/colorutils.js`.

## 1. `colorcore`

Primitives: `rgbtohsl`, `hsltorgb`, `hextorgb`, `rgbtohex`, `hsltohex`,
`pad2`, `parsecomponent`, `relativeluminance`, `linearchannel`,
`linearrgbtooklab`, `oklabtolinearrgb`, `oklchtorgb`, `rgbtooklch`,
`createcolorconstants`, `extractinlinestyle`. All pure. Signatures and
return shapes as declared in the source.

## 2. `colorharmony`

Derivations: `shifthues`, `complementary`, `analogous`, `triadic`,
`splitcomplementary`, `tetradic`, `monochromatic`, `shades`, `tints`,
`pick`, `colorharmonyscore`, `getharmoniouspalette`, `emphasize`.

Recommended for role rules: `emphasize(color, bg, intensity, core)`
returns a colour that stands out against `bg`.

## 3. `colorcontrast`

WCAG derivations: `contrastratio`, `computeforeground`,
`contrastinglevel`, `emphaticlevel`, `getcontrastingpalette`,
`getoptimalforeground`.

Recommended for role rules:
`computeforeground(fg, bg, minratio, contrast, core)` returns a
contrast-safe foreground.

## 4. `colorpalettes`

Generic palette machinery: `lcurve`, `clamp`, `solvel`, `generate`.

## 5. Invariants

- I-1. All functions pure; no mutation.
- I-2. Deterministic.
- I-3. ES5.
