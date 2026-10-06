# System authority

The source of truth for each subsystem. New work extends these; it does not add a second one (audit §101, §111
phase 0). Every name in `code` below is checked by governance to exist in the build, so this page cannot silently go
stale. Counts are never written here: they come from the registries at build time (see the generated catalogue).

| Subsystem | Authority (runtime) | Written through | Generated document |
|---|---|---|---|
| Canonical record | `DB` | `save` | docs/implementation/baseline.json |
| Events and history | `emitEvent` / `EVENT_TYPES` | `emitEvent` | event log in the record |
| Observation types | `OBS_TYPES` | `addObservation` | governance catalogue |
| Quantities and units | `QUANTITY_REGISTRY` | the dimension tables | direction gate |
| Models | `MODELS` via `modelContract` | model registration | baseline registries.models |
| Inference | `infer` | the gateway only | provenance store |
| Dependencies | `dependencyGraph` | model inputs | direction gate |
| Uncertainty | `uncertaintyChain` | model results | — |
| Decisions | `decide` | decision ledger | — |
| Knowledge | `knowledgeGraph` | findings and experiments | — |
| Experiments | `createExperiment` / `experimentSpec` | createExperiment | — |
| Plan and schedule | `currentPlan` / `scheduleModel` | plan versions | — |
| Food identity | `foodIdentity` | `logFood` | food lock (data/food.lock.json) |
| Supplements | `SUPPLEMENT_CATALOGUE` / `MICRONUTRIENTS` | `resolveSupplement` | — |
| External sources | `EXTERNAL_SOURCES` / `externalSources` | `registerExternalSource` | external source audit |
| Data sources in the record | `sourceKeyOf` / `pickDayTotal` | importObservations | — |
| Presentation | `WIDGET_REGISTRY` / `VIEW_REGISTRY` | `registerWidget` / `registerView` | — |
| Actions and navigation | `ACTIONS` via `registerAction` | `dispatchAct` | palette catalogue |
| Automation | `QUICK_ACTIONS` / `AUTOMATION_ACTIONS` | `runAutomationsFor` | — |
| Local dates | `localDateOf` / `todayISO` | — | timezones gate |

**Documents that are history, not authority:** docs/architecture-roadmap.md records how the system was built, in order;
statements in it such as "still open" or a count describe the moment they were written. The generated catalogue and
the registries above describe the system now.
