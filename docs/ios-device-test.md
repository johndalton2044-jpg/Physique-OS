# iOS device test

The headless gate (`npm test`) boots the app in jsdom and runs 107 checks plus 114 in-app self-tests. jsdom
has no layout engine, no real viewport, no service worker and no Safari. Everything below therefore has to be
done on a physical device, and the app keeps your results: **Tools → Device test checklist**, Pass / Fail per
item, stored in `settings.deviceTests`.

Do these on the device you actually use. A simulator shares neither Safari's storage eviction behaviour nor
its keyboard geometry.

## Setup

Serve the dist over HTTPS or `localhost` — a service worker will not register over plain `http://` to a LAN
address.

```
npm run serve     # http://localhost:8080
```

For a phone on the same network, put it behind a TLS tunnel, or copy `dist/` to any static HTTPS host.

---

## 1. Install and launch

Safari → Share → **Add to Home Screen**. Launch from the Home Screen icon.

- Launches without Safari chrome (standalone).
- The icon is the app icon, not a page screenshot.

**Why it matters.** The Home Screen web app is a different storage regime from a Safari tab. In a tab,
Intelligent Tracking Prevention can delete script-writable storage (IndexedDB, localStorage) after seven days
without interaction. A Home Screen web app is documented by WebKit as exempt from that seven-day rule. Every
storage expectation in this app assumes the Home Screen install.

## 2. Offline: the app opens

Airplane mode on. Force-quit the app. Relaunch.

- Every tab renders: Today, Log, Plan, Train, Food, Body, Progress, Diagnose, Experiments, Learn, Archive, Tools.
- Today shows a decision, not an error or a blank card.

## 3. Offline: food search

With network **on**, Tools → prefetch the food database (this warms the service-worker cache with all shards).
Airplane mode on. Food → search a common term.

- Results appear.
- Without a prefetch, expect search to report the database as unreachable — that is correct behaviour, not a bug.

## 4. Rotate with a sheet open

Open the quick-log sheet. Rotate to landscape, then back to portrait.

- The sheet stays anchored, its buttons stay reachable, and nothing is cut off at either orientation.

**Why it matters.** Viewport height changing while a fixed-position overlay is open is the classic iOS layout
break.

## 5. Keyboard does not cover Save

Open Log → weight. Tap the value field so the keyboard appears.

- The Save button is still visible and tappable without dismissing the keyboard.

**Why it matters.** iOS resizes the *visual* viewport, not the layout viewport, so `position: fixed` elements
can end up underneath the keyboard.

## 6. Scroll lock

With a sheet open, drag on the area behind the sheet.

- The page behind does not scroll.
- Closing the sheet returns you to the same scroll position.

## 7. Text size XL

Settings → text size **XL**. Walk every tab.

- Nothing clips, overlaps or scrolls horizontally.
- Numbers in metric cards stay on one line or wrap cleanly.

**Why it matters.** Every size derives from `--ts`. Anything that breaks here is a hard-coded pixel value.

## 8. Contrast

Settings → contrast **high**.

- The change is visibly obvious immediately.

**Why it matters.** This setting was previously written to `<body>` while the stylesheet selected
`html[data-contrast="high"]`, so it silently did nothing. The build now fails if that regresses, and the gate
asserts the attribute lands on `<html>` with a matching rule — but only a human eye confirms it *looks*
different.

## 9. Reduced motion

iOS Settings → Accessibility → Motion → **Reduce Motion** on. Return to the app and switch tabs.

- Transitions and animations stop.
- Repeat with the in-app motion setting instead of the OS one; both paths should work.

## 10. Touch targets

Try every control with a thumb, not a fingertip: tab bar, day-strip chips in Log and Food, scale rows in the
recovery sheet, small ghost buttons, the FAB.

- Nothing requires a second attempt or precise aim.

**Why it matters.** The build gate checks that a 44px minimum is declared in CSS. It cannot check the rendered
box, and it cannot check whether two 44px targets sit so close that you hit the wrong one.

## 11. Backup and restore — the important one

1. Tools → Data → **Export backup**. Save the JSON somewhere off the device.
2. Delete the app from the Home Screen.
3. Reinstall from Safari, launch it.
4. Tools → Data → **Restore**, choose the file, **Replace**.

- Counts match what you exported: observations, sessions, food logs, phases, predictions, experiments.
- Today shows the same decision it did before.

**Why it matters.** This is the only test that proves the record survives the worst case. Everything else in
the app is rebuildable; the record is not.

## 12. Update without data loss

Rebuild (`npm run check`), then reload the app twice — the service worker installs on the first load and takes
over on the second.

- Tools → the build ID changes.
- Your record is intact and the schema version is unchanged or migrated with a ledger entry.

**Why it matters.** A service-worker update that orphans IndexedDB looks exactly like data loss to the user.

---

## Recording results

Tools → Device test checklist → **Pass** or **Fail** on each item. The result and its date are stored in the
record, so a later export carries the evidence of what was verified on which build.

Anything that fails here is worth a note in the same place — the checklist keeps the note with the item.
