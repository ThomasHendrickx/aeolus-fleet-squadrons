# Changing a template's ship count: screens

Screens for approval. Docs only. [Issue #43](https://github.com/ThomasHendrickx/aeolus-fleet-squadrons/issues/43). The behaviour they show is the approved picks in [template-count-changes.md](../template-count-changes.md). The choices these screens make are its [Screen questions](../template-count-changes.md#screen-questions).

**Simulated.** Everything here is drawn, not built. The data, people and ships are invented. No squadrons call, count or claim exists yet, and the buttons do nothing. These screens do not decide who may see the page or how the fleet names a template owner.

[screens.html](screens.html) stands alone: it carries aeolus-fleet's `packages/ui/src/tokens.css` and its Geist fonts, from aeolus-fleet main on 12 Nov 2026. To preview it, open the file in a browser, or serve the folder with `python3 -m http.server 8043 --directory docs/design/template-count-changes/mockups` and open `http://localhost:8043/screens.html`. Each PNG is one frame of that file, rendered whole in Chromium at 1x: desktop 1440 wide, phone 375, light and dark.

The page is the console's existing template page (`TemplateView`), drawn as built today and then with a Ships allowed section added.

| State | 1440 light | 1440 dark | 375 light | 375 dark |
| --- | --- | --- | --- | --- |
| Today: the template page, no ship count | [png](today-template-1440-light.png) | [png](today-template-1440-dark.png) | [png](today-template-375-light.png) | [png](today-template-375-dark.png) |
| A version proposes fewer ships: 4 confirmed, baker@2 states 1, 3 ships and 1 being created, 2 waiting | [png](lower-1440-light.png) | [png](lower-1440-dark.png) | [png](lower-375-light.png) | [png](lower-375-dark.png) |
| Confirming fewer ships than exist | [png](lower-confirm-1440-light.png) | [png](lower-confirm-1440-dark.png) | [png](lower-confirm-375-light.png) | [png](lower-confirm-375-dark.png) |
| Confirming, busy | [png](busy-1440-light.png) | [png](busy-1440-dark.png) | [png](busy-375-light.png) | [png](busy-375-dark.png) |
| Confirmed below the ships that exist: none retired or released | [png](lowered-1440-light.png) | [png](lowered-1440-dark.png) | [png](lowered-375-light.png) | [png](lowered-375-dark.png) |
| Confirming more ships: 1 allowed, baker@3 states 3, 2 waiting | [png](raise-confirm-1440-light.png) | [png](raise-confirm-1440-dark.png) | [png](raise-confirm-375-light.png) | [png](raise-confirm-375-dark.png) |
| The confirmation failed: squadrons wrote nothing, 4 stay allowed, Try again is safe | [png](failed-1440-light.png) | [png](failed-1440-dark.png) | [png](failed-375-light.png) | [png](failed-375-dark.png) |
| The answer is lost or squadrons restarted: the change may or may not be written; Read the count again shows what squadrons kept | [png](lost-1440-light.png) | [png](lost-1440-dark.png) | [png](lost-375-light.png) | [png](lost-375-dark.png) |
| Refused: no longer the template owner | [png](refused-1440-light.png) | [png](refused-1440-dark.png) | [png](refused-375-light.png) | [png](refused-375-dark.png) |
| The template owner kept the count: baker@2 still states 1, not confirmed | [png](kept-1440-light.png) | [png](kept-1440-dark.png) | [png](kept-375-light.png) | [png](kept-375-dark.png) |
| A one-per-request template whose version 2 states 1 ship at a time, shared | [png](per-request-1440-light.png) | [png](per-request-1440-dark.png) | [png](per-request-375-light.png) | [png](per-request-375-dark.png) |
| Loading: the section shows a skeleton | [png](loading-1440-light.png) | [png](loading-1440-dark.png) | [png](loading-375-light.png) | [png](loading-375-dark.png) |
| The count cannot be read: no count shown, no change offered | [png](read-error-1440-light.png) | [png](read-error-1440-dark.png) | [png](read-error-375-light.png) | [png](read-error-375-dark.png) |
| Someone other than the template owner reads the page | [png](viewer-1440-light.png) | [png](viewer-1440-dark.png) | [png](viewer-375-light.png) | [png](viewer-375-dark.png) |
| No template owner: the template owner's ship is retired | [png](no-owner-1440-light.png) | [png](no-owner-1440-dark.png) | [png](no-owner-375-light.png) | [png](no-owner-375-dark.png) |

After a lost answer, reading the count again shows one of two screens. If the change was written, it is the confirmed screen (`lowered`). If it was not, the proposal is still waiting (`lower`). The page claims neither until it has read the count squadrons kept.

One shortcut in the drawing: the raise screen's source line and charter still show baker@2's file and commit, not baker@3's.
