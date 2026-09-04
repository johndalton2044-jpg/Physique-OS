# Interaction specification

The rule this document exists to enforce:

> Every important state must be navigable to, every important action must have at least one obvious path, and
> every hidden or power-user path must have a discoverable equivalent.

A capability that exists only because someone might guess a keyboard shortcut does not exist. This is checked,
not asserted: `interactionMatrix()` fails the self-test if any command is reachable only by keyboard or
gesture, and the gate asserts that every `data-act` rendered in the interface resolves to a registered action.

---

## Command taxonomy

`94-navigation.js` holds one register of what the application can do. The command palette, the keyboard map,
the utility rail and the interaction matrix are all **projections of that register**, so a capability cannot be
reachable one way and invisible another.

| group | covers |
|---|---|
| Navigation | tab, section, date, timeline, back/forward, top/bottom |
| Logging | observation, food, training, note, context |
| Editing | edit, correct, retract, duplicate |
| Analysis | compare, replay, why, what changed, counterfactual, missing data, data quality |
| Decisions | apply, hold, record your own, inspect evidence, evaluate an experiment |
| Recovery | undo, redo history, restore, retry |
| Discovery | search, command palette, help, shortcuts, attention |
| System | settings, accessibility, offline, storage, backup, update, diagnostics |

Surfaces recorded per command: `ui` (a visible control in a view), `rail` (the utility rail), `palette` (⌘K),
`key` (keyboard), `context` (long press / right click), `sheet` (inside a sheet).

**The rule the matrix enforces:** `ui || rail || palette || sheet` must be true. `key` and `context` are
accelerators and never count toward discoverability. Tools → Interaction matrix renders the whole table.

---

## Keyboard

Generated from `KEYMAP`, which is also what the hotkey handler reads — a shortcut cannot exist without being
documented, and `?` opens the list.

| keys | action |
|---|---|
| ⌘/Ctrl K | Command palette |
| `/` | Search |
| `?` | Keyboard help |
| ⌘/Ctrl Z | Undo the last change |
| `Esc` | Close a sheet, dialog or replay |
| `1`–`9` | Go to a view by position |
| `G` then `H L P T F B R D E N A S` | Go to a named view |
| `[` `]` | Back / forward through application history |
| `←` `→` | Previous / next day |
| `T` | Jump to today |
| `Home` `End` `PgUp` `PgDn` | Top, bottom, page up, page down |
| `L` | Quick log |
| `A` | Attention queue |
| `F` | Focus mode |
| `Tab` / `Shift+Tab` | Move through controls; inside a sheet focus stays in the sheet |

The `G` prefix expires after 1.2 seconds so a stray press cannot swallow the following keystroke, and no
shortcut fires while a text field has focus.

---

## Navigation model

**Application history is not browser history.** A position is a tab *plus* scroll offset, selected date,
active filters and replay state. `navPush()` records one on every view change; `[` and `]` restore one. Closing
a sheet returns to the position and the control that opened it, not to the top of a re-rendered view.

**Scroll is remembered per tab** and restored on return. Automatic movement respects `prefers-reduced-motion`
and the in-app motion setting, and never steals focus — an unexpected scroll is as disorienting to a
screen-reader user as a focus jump.

**Day navigation** goes beyond one-step-at-a-time: previous logged day, previous day with food, previous
weigh-in, previous training day, phase start, last intervention, and jump-to-date.

---

## Attention, not notifications

Every item in the attention queue answers three questions and carries the action that resolves it:

```
What happened      An experiment reached its recheck date
Why it matters     An experiment that is never evaluated becomes a belief instead of a result
What can be done   [Evaluate: steps 8,000 → 11,000]
```

Items are ordered `action` → `review` → `system`. The rail button is hidden entirely when the queue is empty,
because a control that is always present but usually inert teaches people to ignore it. There are no badge
counts for their own sake.

---

## Uncertainty as a path

Two reports turn "we are not sure" into somewhere to go:

* **Missing data** — per stream: how many of the last 14 days are logged, **what the gap limits**, and the
  action that closes it. An unlogged day is unknown, not zero.
* **Data quality** — anomalies, entries flagged on capture, low measurement quality, stale streams and
  protocol discontinuities. Every row opens the record it concerns.

**Setup completeness** applies the same idea to onboarding: it is a live state rather than a one-time
tutorial, each incomplete item says **what it unlocks**, and the strip disappears from Today once complete
rather than becoming permanent furniture.

---

## Explanation components

`renderWhy(modelId)` and `renderWhatChanged(days)` are generated from the model registry and the decision
ledger rather than written per screen, so an explanation cannot drift from the thing it explains. Every
"Why?" answers the same six questions in the same order: what it is, epistemic class, inputs, assumptions,
when it fails, uncertainty — plus evidence, alternatives and what would change it.

"What changed?" is derived from interventions, phase history, decisions and program history, so the list
cannot disagree with what the system actually did.

---

## Focus mode

Hides secondary disclosure, research blocks and timeline detail. It **never** hides a warning, an uncertainty
statement or a provenance mark, and the gate asserts that: reducing clutter must not reduce honesty.

---

## Deliberately not implemented

The catalogue proposed more than is wise to build. These were considered and declined, with reasons:

* **Swipe-to-delete and swipe between tabs.** iOS already owns edge swipes for system back navigation, and a
  destructive gesture with no confirmation is the wrong default for a record that is meant to be permanent.
  Long press opens the same inspector a tap opens, which is reversible.
* **Usage-ranked action reordering.** The catalogue itself warns against silently reordering critical actions
  on weak usage data. A log button whose contents move is a log button you have to read every time.
* **Multi-select and bulk retract.** The ledger makes every deletion recoverable, but bulk destructive
  operations across an append-only record need an audit design of their own. Not started rather than
  half-built.
* **Play/pause replay animation.** Replay is already navigable day by day; an autoplaying reconstruction of
  your own history invites watching rather than reading, and the risk of mistaking historical output for
  current advice rises with every second the user is not actively stepping through it.

---

## What still needs a device

`docs/ios-device-test.md` covers the twelve checks jsdom cannot make: safe-area handling, keyboard viewport
collisions, standalone-mode storage, VoiceOver rotor navigation, touch target reachability with a thumb, and
the backup/restore/reinstall cycle. The checklist lives in Tools and records pass/fail into the record.
