# Interaction specification

The rule this document exists to enforce:

> Every important state must be navigable to, every important action must have at least one obvious path, and
> every hidden or power-user path must have a discoverable equivalent.

A capability that exists only because someone might guess a keyboard shortcut does not exist. This is checked,
not asserted: `interactionMatrix()` fails the self-test if any command is reachable only by keyboard or
gesture, and the gate asserts that every `data-act` rendered in the interface resolves to a registered action.

---

## History integrity comes first

A navigation layer built over temporal holes is worse than no navigation layer, because it makes wrong
history easier to reach. So the foundation is checked before anything is layered on it:

* **The event log has no size limit.** It has a working window. When the window fills, the events falling out
  of it are folded into an immutable snapshot and the originals are written to a durable archive. Nothing is
  deleted — the previous behaviour spliced the oldest 
  events away, which silently destroyed history in a system whose stated invariant is that nothing is.
* **A snapshot is a baseline, not a change**, so it folds into every projection regardless of the replay
  date. Excluding it because its timestamp is newer than the replay date erased the entire record from
  replays of a restored or demo record.
* **Session edits supersede**, exactly as food-log edits do. A session corrected today still reads as it did
  last week in a replay of last week.
* **A build-time mutation audit** (`build.mjs`) fails the build if protected state — phase targets, the
  training program, retraction flags, food quantities, the profile — is written outside its approved
  primitive. It found the experiment sheet writing phase targets directly, which left no phase history.
* **History integrity is user-verifiable**, not merely internally true: Tools → History integrity rebuilds
  the record from its own log and checks both replay mechanisms against each other.

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

**Every registered action is in the register.** Internal handlers (a field inside a sheet, a dispatcher hook)
are marked `internal` rather than omitted, so a new action cannot become reachable without also becoming
auditable. Commands that need a subject — retract *this* entry, evaluate *that* experiment — are marked
`standalone: false`: they belong on the row, not in a list of verbs with nothing to act on.

Each user-facing command carries what a person needs in order to choose it:

* **a description** in plain language, shown in the palette under the label;
* **aliases**, so someone who thinks of it as "scan" finds the nutrition-panel reader and someone who thinks
  of it as "zen" finds focus mode;
* **an availability rule that returns a reason, not a boolean.** A disabled control that will not say why is
  a dead end. "Start a phase" reports *a phase is already running — end it first*; "Evaluate an experiment"
  reports *no experiment has reached its recheck date yet*. Unavailable commands stay listed, ranked lower,
  with the reason visible.

The palette also answers **"what can I do here"**: with no query it leads with commands relevant to the
current view. Frequently used commands rank up, but never far enough to outrank an exact label match —
a list whose order you cannot predict is a list you have to read every time.

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

## Presence is not visibility

`npm run audit` exists because of a bug the rest of the suite could not see: `.fab-mini` was `display:none`
behind a class nothing ever added, so the whole utility rail was invisible while every element remained in
the DOM with a correct accessible name. Every assertion about it passed.

The audit checks four things, none of them behavioural:

1. **Visibility** — does each view and sheet render, by computed style rather than by existing?
2. **Population** — does it hold real content against a real record, or is it an empty shell?
3. **Dead toggles** — does every class and `data-` attribute the code toggles have a stylesheet rule that acts
   on it, and is any rule keyed on a class nothing adds?
4. **Placeholders** — does any surface leak `NaN`, `undefined`, `[object Object]` or an unresolved token?

The dead-toggle check found a second bug of the same family immediately: the sync and encrypted-backup import
actions set `data-sync` and `data-encrypted` on the file input, and the handler never read them. **Both import
paths were broken** — an envelope or an encrypted file was validated as a plain database and rejected. What a
file is, is now decided by reading it, not by which button opened the picker, which also means a file dropped
in from anywhere is handled correctly.

jsdom does no layout, so geometry still needs a real browser. It does resolve the cascade, which is where this
class of bug lives.

## Two rails, two jobs

The right-hand rail is for ACTION: **command and undo, and nothing else**. The left-hand rail is for
POSITION: today, top, bottom, back.

It was not always this short. The right rail grew to six floating buttons — jump-to-top, back, attention,
command, undo — stacked over the text column, and **jump-to-top appeared on both rails at once**. Six controls
floating over a column of prose is not a rail, it is an obstruction, and a duplicated one is worse because it
makes the interface look accidental.

What moved and why:

* **Attention → the header.** It is a count, a status. A status does not belong in a stack of actions.
* **Back and jump-to-top → the position rail**, which is what they are. That also removed the duplication.
* **Everything else → the palette**, which reaches every command anyway, so nothing lost reachability.

The audit now enforces this structurally: no more than two controls on the right, no action on both rails, no
more than seven floating controls in total. Congestion is a shape, so it is checked as one. Keeping them apart means a thumb reaching for "top"
never lands on "undo", and each rail stays short enough to read.

Both are stateful. "Up" appears only once there is somewhere to go up to; "down" disappears at the end of the
view; "back" only when there is history. A control that is always present but usually inert teaches people to
ignore the rail. Where a measurement needed for that decision is unavailable — first paint, or an environment
that does no layout — the control stays **visible**: vanishing because something could not be measured is
worse than appearing needlessly.

**Scrolling stops at the content, not at the end of the document.** `main` carries 150px of bottom padding so
the floating controls never cover a card. Jumping to the document end therefore parked the viewport inside
that padding, with the last card scrolled off the top and a blank strip below it. The bottom control now
targets the bottom of the last rendered element, brought to the bottom of the viewport with a small margin,
clamped to the real maximum. Paging down stops there too, "down" hides once the content is fully in view
rather than once the document is, and every scroll — including a position remembered from a longer view — is
clamped. Where no layout measurement is available the old document-end behaviour is used rather than failing.

**The `hidden` attribute is the single source of visibility.** The rail previously defaulted to `display:none`
behind a class that nothing ever added, so every button in it was invisible while remaining present in the
DOM — and assertions that checked only for presence passed the entire time. Visibility is now driven by the
same attribute assistive technology reads, so a control cannot be visually present but semantically absent, or
the reverse. The gate checks computed style, not existence.

Both rails are flex columns, so buttons stack by document order. Positioning each button individually meant
every new one landed on top of another unless someone remembered to choose a free offset.

## Recall, jumps and comparisons

Most questions are one of two shapes: *take me to the thing that changed*, or *is this better than last
time*. Both are cheap once the record is a ledger.

* **Recent** — the last things recorded, newest first, each with a way in.
* **Take me to…** — the last change to the plan, the last scored forecast, the next thing waiting on you, the
  start of this phase, the last detected shift, and back to where you were. Not a calendar: places worth
  returning to.
* **What changed since yesterday** — separated into what *you* recorded and what the *system* changed, because
  conflating them hides which of the two moved.
* **Compare** — forecast against outcome (reported as coverage, since an interval that is right far more often
  than it claims is as miscalibrated as one that is right less often), phase against phase (by rate, never by
  total, because phases differ in length and starting weight), and before against after an intervention —
  which states in the panel that it is a comparison and not a cause.
* **Why am I seeing this?** — answered from the item's own provenance, including what it costs to ignore it.

**Copy and export**: a decision copies as a readable report of the reasoning with no measurements in it, so it
can be shared without sharing a body. A trace copies with its steps and epistemic classes. Selected records
export as CSV. Where the clipboard is unavailable the text is downloaded instead rather than failing silently.

## Saved searches, pins and layout

**A saved search stores the query, never its results.** Cached results would show the record as it stood when
the search was saved, which is precisely the kind of quiet staleness the rest of the system is built to avoid.
It re-runs each time, reports how many it finds *now*, and says so plainly when a search that used to match
things no longer matches any.

**Pinned commands lead the empty palette**, ahead of the view-context suggestions: a pin is an explicit choice
and should outrank an inferred one. Neither ever displaces an exact match once something is typed. Eight is
the limit, and reaching it says so rather than silently dropping the oldest.

**Layout is an explicit mode, not a silent reflow.** Two columns need at least 1024px; asking for them on a
narrower window collapses to one and explains why, rather than leaving two half-columns with nothing readable
in either. The requirement lives in the stylesheet as well as the setting, so the two cannot disagree.

Both saved searches and pins live in settings rather than the record — they are preferences about *reading*
the record, not facts about the body. That is the presentation-versus-epistemic split the review asked to be
formalised.

## Every number can say where it came from

The model registry already declares inputs, assumptions, failure conditions and uncertainty. A **trace** walks
that declaration for one number and resolves it against the record, so the answer is what produced *this*
value on *this* day rather than a description of the method in general.

The number itself is the affordance: metrics with a registered trace are tappable, carry an accessible name,
and open a step chain. Each step shows its own epistemic class, so a chain that passes through a population
figure shows it at the step where it enters. Where a chain rests on one, the trace **says so at the top**
rather than leaving it buried — the maintenance estimate declares that it assumes 3,500 kcal per pound of
tissue, which is a population number and not a measurement of you.

Two rules keep traces honest:

* **A trace never recomputes with different rules to explain itself.** It reports the same call the view made,
  so an explanation cannot disagree with the thing it explains. The self-test asserts the trace's figure
  equals the model's figure.
* **An insufficient trace says what is missing** instead of producing a number anyway. A figure generated to
  fill the space would be a guess wearing the same typography as a measurement.

Traces link onward to the traces they depend on: the maintenance chain offers the weight-trend chain, which
offers your own scale noise. Registered: weight trend, maintenance, energy balance, body-fat estimate,
adherence, forecast, rate band.

## Replay is a mode, not a report

Replay used to be a form that produced a summary. As a mode, the **entire interface renders as of the chosen
day** — you read the app as it was, rather than reading a description of it. That works everywhere at once,
including views written before replay existed, because the single render entry point is wrapped rather than
each view being taught about replay.

The hazard is obvious and is the reason for every design choice here: **historical output mistaken for
current advice**. Three things prevent it, none optional.

* A **persistent banner** that cannot be scrolled away from, stating the date, how long ago it was, and that
  nothing recorded after that day is visible. It updates synchronously on entering the mode — a banner that
  appears a frame late is a frame in which history looks current.
* A **visual treatment on every view** while the mode is active.
* The **quick-log control is hidden**, because logging into the past is not what replay does.

There is still no autoplay. Stepping is deliberate and each step is a choice; an autoplaying reconstruction
invites watching, and watching is how the banner stops being read.

**Waypoints** matter as much as the scrubber. Nobody looks for the moment something moved by stepping through
months of unremarkable days, so replay offers the days on which something was decided, changed, started or
detected — interventions, phase boundaries, experiments, change points, episodes.

**Then and now** closes the loop. It compares what was known on that day against what is known now, shows the
decision that would have been made, and — where enough time has passed — **what the fortnight after actually
did**. That last part is the only honest way to judge a past decision, and it is precisely what a replay that
merely reconstructs state cannot give you. Later corrections and retractions stay invisible to it, which is
what makes it a fair test rather than a rerun with hindsight.

## Selection and bulk operations

Deferred once, then designed rather than bolted on. Five rules:

1. **A bulk operation is never a new kind of mutation.** It is N of the same operation the single-record path
   already performs, so retracting twenty entries produces twenty dated retractions in the ledger — not a
   deletion, and not a special "bulk" record that later code would have to understand.
2. **The whole batch is one undo entry**, labelled with its count ("retract 4 observations"). Undoing a
   mistaken batch must not take twenty presses, and a half-undone batch is worse than either end of it.
3. **Confirmation names the count and the kind**, and destructive actions list what will go. "Retract 14
   entries" is a decision; "Are you sure?" is not.
4. **Selection is transient.** It never touches the record, never survives a reload, and clears after any
   operation, so a stale selection cannot act on records the user has navigated away from.
5. **Every bulk action has a single-record equivalent**, so the capability is not gated behind discovering
   selection mode.

Available on observations (retract, flag for review) and food entries (remove, move to another meal, copy to
another day). Each batch is also written to `ledger.batches` for the audit trail.

## Error recovery

`systemHealth()` reports four conditions, and only the ones the user can act on carry an action:

| condition | severity | recovery offered |
|---|---|---|
| A save did not persist | critical | export a backup — the one recovery that does not depend on storage |
| A stored record was quarantined | critical | restore a backup; the raw copy is preserved |
| IndexedDB unavailable | warn | export more often; storage fell back to localStorage |
| Errors handled silently | warn | export diagnostics — stated as *not* user-recoverable |
| Offline | info | none needed; nothing but food-database downloads requires the network |

A failed save raises a **persistent banner**, not a toast: a toast that vanishes is the wrong shape for an
unresolved problem, and every later change compounds it. `retryable(label, fn)` offers the same call again on
failure, with "export a backup" as the alternative.

## Deliberately not implemented

The catalogue proposed more than is wise to build. These were considered and declined, with reasons:

* **Swipe-to-delete and swipe between tabs.** iOS already owns edge swipes for system back navigation, and a
  destructive gesture with no confirmation is the wrong default for a record that is meant to be permanent.
  Long press opens the same inspector a tap opens, which is reversible.
* **Usage-ranked action reordering.** The catalogue itself warns against silently reordering critical actions
  on weak usage data. A log button whose contents move is a log button you have to read every time.
* **Play/pause replay animation.** Replay is already navigable day by day; an autoplaying reconstruction of
  your own history invites watching rather than reading, and the risk of mistaking historical output for
  current advice rises with every second the user is not actively stepping through it.

---

## What still needs a device

`docs/ios-device-test.md` covers the twelve checks jsdom cannot make: safe-area handling, keyboard viewport
collisions, standalone-mode storage, VoiceOver rotor navigation, touch target reachability with a thumb, and
the backup/restore/reinstall cycle. The checklist lives in Tools and records pass/fail into the record.
