# Data adapters

Physique OS ships with two food sources built in: **USDA Foundation Foods** (inline, 354 foods) and **USDA
Branded Foods** (455,381 products in lazy-loaded shards). Three further sources have adapters installed in the
app but no data in this distribution. Each is a separate download because of size or licence-transcription
effort, and each has a builder script here.

The app never falls back to a guess when an adapter's data is missing. `adapterState()` reports
`not installed`, Tools → Food database internals shows it, and the affected feature says what is absent.

| Adapter | What it adds | Builder | Output |
|---|---|---|---|
| FNDDS 2021–2023 | survey foods (typical prepared dishes) with national-average portion weights | `scripts/fndds-build.mjs` | `dist/data/food/fndds/` |
| NIH DSLD | supplement label declarations and ingredient rows | `scripts/dsld-build.mjs` | `dist/data/supplements/` |
| Retention + yields | nutrient retention through cooking; raw→cooked weight change | `scripts/reference-build.mjs` | `dist/data/reference/` |

---

## FNDDS 2021–2023

Branded Foods answers "what is in this package". FNDDS answers "what is in a serving of this dish, as people
actually make it" — useful for restaurant meals and home cooking that has no barcode.

Download the At-A-Glance CSV exports from FoodData Central and put three files in one directory:

```
fndds-csv/
  fndds-foods.csv       Food code, Main food description, WWEIA Category description
  fndds-nutrients.csv   Food code, Nutrient code, Nutrient value        (per 100 g)
  fndds-portions.csv    Food code, Portion code, Portion description, Portion weight (g)
```

```
npm run fndds
# or: node scripts/fndds-build.mjs --in ./fndds-csv --out dist/data/food/fndds --version "FNDDS 2021-2023"
```

Column headers are matched case-insensitively by substring, because USDA changes them between releases. If a
required column cannot be found the script prints the headers it did find and stops rather than guessing.
Foods with no energy value are dropped: a search result that cannot answer "how many calories" is noise.

Nutrient codes read: 208 energy, 203 protein, 205 carbohydrate, 204 fat, 291 fiber, 269 sugars, 606 saturated
fat, 307 sodium, 306 potassium, 301 calcium, 303 iron, 601 cholesterol.

**What FNDDS records are.** A survey food is a national average of how a dish is typically prepared. It is not
brand-specific and its portions are averages, not your plate. The app labels them accordingly.

---

## NIH Dietary Supplement Label Database

```
dsld-export/
  dsld-products.json          (bulk/API export)   — or —
  dsld-products.csv           DSLD ID, Product Name, Brand Name, Physical Form, Serving Size
  dsld-ingredients.csv        DSLD ID, Ingredient Name, Quantity, Unit, Percent Daily Value
```

```
npm run dsld
```

**What DSLD records are.** The label as printed by the manufacturer, transcribed. Not an assay. Two products
with identical labels can differ in what is in the bottle; only third-party testing (USP, NSF, Informed Sport)
speaks to that. The app states this wherever a DSLD record is shown, and supplement guidance continues to come
from the NIH ODS fact sheets regardless of whether this adapter is installed.

---

## Retention factors and yields

Two USDA lookup tables that make cooked-food entries more accurate:

**Nutrient Retention Factors, Release 6 (2007).** A 4-digit code per cooking method with the percentage of
each mineral and vitamin retained. Used by `applyRetention(nutrients, code)`.

**Agriculture Handbook 102, Food Yields Summarized by Different Stages of Preparation.** Weight change from
raw to cooked, trimmed or drained. Used by `applyYield(grams, code)`.

```
node scripts/reference-build.mjs --retention ./retention.csv --yields ./yields.csv --out dist/data/reference
```

**Why these are not shipped.** AH-102 is distributed as a 139-page scan with no text layer. OCR of its tables
is legible to a human but garbles the numeric columns — a sampled page rendered a yield of 77% as `77 | 88 to
OB`. A wrong yield factor silently misstates every cooked-food entry that uses it, and a silent numeric error
is worse than a missing feature. The builder therefore takes a transcribed CSV and does no OCR itself.

With neither table installed:

* `applyRetention()` returns the input unchanged and reports that retention factors are not installed.
* `applyYield()` returns the input unchanged and advises entering the weight in the state you actually ate —
  cooked weight for a cooked food, which is what a food scale gives you anyway.

That fallback is correct, not degraded: Foundation and Branded entries are already stated for the food as
listed, and "chicken breast, cooked" is a different record from "chicken breast, raw".

---

## Verifying a build after adding data

```
npm run verify
```

`scripts/verify-dist.mjs` re-reads every file, checks it against `BUILD-MANIFEST.json` and `SHA256SUMS`,
confirms the PWA assets and service-worker shell exist, confirms `index.html` references nothing missing, and
verifies each data directory against its own checksum file. `npm run package` runs build → test → verify
before it will produce a tarball.
