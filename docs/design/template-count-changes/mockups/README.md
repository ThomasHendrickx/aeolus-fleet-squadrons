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
| The answer is lost or squadrons restarted: the old count holds, Try again is safe | [png](error-1440-light.png) | [png](error-1440-dark.png) | [png](error-375-light.png) | [png](error-375-dark.png) |
| Refused: no longer the template owner | [png](refused-1440-light.png) | [png](refused-1440-dark.png) | [png](refused-375-light.png) | [png](refused-375-dark.png) |
| Someone other than the template owner reads the page | [png](viewer-1440-light.png) | [png](viewer-1440-dark.png) | [png](viewer-375-light.png) | [png](viewer-375-dark.png) |
| No template owner: the template owner's ship is retired | [png](no-owner-1440-light.png) | [png](no-owner-1440-dark.png) | [png](no-owner-375-light.png) | [png](no-owner-375-dark.png) |

Not drawn:
- The page after Keep. The callout goes, and the version row keeps "States 1 ship" without Confirmed.
- A template with one ship per request.
- Loading and the page's read error, which stay as the template page has them today.
- In the raise screen, the source line and charter still show baker@2's file and commit, not baker@3's.
