# Changing a template's ship count: screens

Screens for approval. Docs only. [Issue #43](https://github.com/ThomasHendrickx/aeolus-fleet-squadrons/issues/43). The behaviour they show is the approved picks in [template-count-changes.md](../template-count-changes.md). The choices these screens make are its [Screen questions](../template-count-changes.md#screen-questions).

**Simulated.** Everything here is drawn, not built. The data, people and ships are invented. No squadrons call, count or claim exists yet, and the buttons do nothing. These screens do not decide who may see the page or how the fleet names a template owner. Approving them approves no identity, API or rights change (S1 and S1a in the design). The no-owner screen's words assume S1a option 1, a template owner that is a person ship.

[screens.html](screens.html) stands alone: it carries aeolus-fleet's `packages/ui/src/tokens.css` and its Geist fonts, from aeolus-fleet main on 12 Nov 2026. To preview it, open the file in a browser, or serve the folder with `python3 -m http.server 8043 --directory docs/design/template-count-changes/mockups` and open `http://localhost:8043/screens.html`. Each PNG is one frame of that file, rendered whole in Chromium at 1x: desktop 1440 wide, phone 375, light and dark.

The page is the console's existing template page (`TemplateView`), drawn as built today and then with a Ships allowed section added. Revised after Thomas's feedback of 12 Nov: a change shows as a card that explains itself, with Approve and Decline.

| State | 1440 light | 1440 dark | 375 light | 375 dark |
| --- | --- | --- | --- | --- |
| Today: the template page, no ship count | [png](today-template-1440-light.png) | [png](today-template-1440-dark.png) | [png](today-template-375-light.png) | [png](today-template-375-dark.png) |
| Arriving from a link elsewhere: the change, where it came from, how it was found, why now, both consequences, then Approve and Decline | [png](arrive-1440-light.png) | [png](arrive-1440-dark.png) | [png](arrive-375-light.png) | [png](arrive-375-dark.png) |
| Approving: the last check, with source and consequence | [png](approve-1440-light.png) | [png](approve-1440-dark.png) | [png](approve-375-light.png) | [png](approve-375-dark.png) |
| Approving, busy | [png](busy-1440-light.png) | [png](busy-1440-dark.png) | [png](busy-375-light.png) | [png](busy-375-dark.png) |
| After approving, below the ships that exist: none retired or released | [png](approved-1440-light.png) | [png](approved-1440-dark.png) | [png](approved-375-light.png) | [png](approved-375-dark.png) |
| Declining: the last check, saying what declining does not do | [png](decline-1440-light.png) | [png](decline-1440-dark.png) | [png](decline-375-light.png) | [png](decline-375-dark.png) |
| After declining: the decision and its result, with Reconsider | [png](declined-1440-light.png) | [png](declined-1440-dark.png) | [png](declined-375-light.png) | [png](declined-375-dark.png) |
| Reconsidering a declined proposal: approve, or leave it declined | [png](revisit-1440-light.png) | [png](revisit-1440-dark.png) | [png](revisit-375-light.png) | [png](revisit-375-dark.png) |
| A newer version (baker@3) proposes another count after baker@2 was declined | [png](new-version-1440-light.png) | [png](new-version-1440-dark.png) | [png](new-version-375-light.png) | [png](new-version-375-dark.png) |
| Approving more ships: baker@3 proposes 3 instead of 1, 2 waiting | [png](raise-1440-light.png) | [png](raise-1440-dark.png) | [png](raise-375-light.png) | [png](raise-375-dark.png) |
| Approving failed: squadrons wrote nothing, 4 stay allowed, Try again is safe | [png](failed-1440-light.png) | [png](failed-1440-dark.png) | [png](failed-375-light.png) | [png](failed-375-dark.png) |
| The approval's answer is lost or squadrons restarted: may or may not be written; Read the count again shows what squadrons kept | [png](lost-1440-light.png) | [png](lost-1440-dark.png) | [png](lost-375-light.png) | [png](lost-375-dark.png) |
| Approving refused: no longer the template owner | [png](refused-1440-light.png) | [png](refused-1440-dark.png) | [png](refused-375-light.png) | [png](refused-375-dark.png) |
| Someone other than the template owner reads the page | [png](viewer-1440-light.png) | [png](viewer-1440-dark.png) | [png](viewer-375-light.png) | [png](viewer-375-dark.png) |
| No template owner: the template owner's ship is retired | [png](no-owner-1440-light.png) | [png](no-owner-1440-dark.png) | [png](no-owner-375-light.png) | [png](no-owner-375-dark.png) |
| A one-per-request template whose version 2 proposes 1 shared ship | [png](per-request-1440-light.png) | [png](per-request-1440-dark.png) | [png](per-request-375-light.png) | [png](per-request-375-dark.png) |
| Loading: the section shows a skeleton | [png](loading-1440-light.png) | [png](loading-1440-dark.png) | [png](loading-375-light.png) | [png](loading-375-dark.png) |
| The count cannot be read: no count shown, no decision offered | [png](read-error-1440-light.png) | [png](read-error-1440-dark.png) | [png](read-error-375-light.png) | [png](read-error-375-dark.png) |

After a lost answer, reading the count again shows one of two screens. If the approval was written, it is the approved screen (`approved`). If it was not, the proposal still waits (`arrive`). The page claims neither until it has read the count squadrons kept.

Approve is the approved "confirm" and Decline the approved "keep the current count" (questions 1 to 3). What a decline means later, for reconsidering and for newer versions, is D1 to D4 in the design.
