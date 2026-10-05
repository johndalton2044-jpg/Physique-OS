# Reference data provenance

Controlled build inputs. The build copies each file into dist/data/reference/ and fails if any checksum in SHA256SUMS
does not match; the release identity hashes this folder.

| File | Source | Produced by | Notes |
|---|---|---|---|
| compendium-2024.json | Adult Compendium of Physical Activities, 2024 (Herrmann et al.) | hand-curated | MET values |
| yields.json | USDA Agriculture Handbook 102, Food Yields (raw to cooked weight) | scripts/ah102-geometry.mjs, then scripts/yields-gate.mjs | partial: only rows whose yield plus loss returns to 100 |

To regenerate yields.json: run the extraction with --out data/reference/yields.json, then
`node scripts/yields-gate.mjs` (which rewrites the file and SHA256SUMS here), and commit both.
