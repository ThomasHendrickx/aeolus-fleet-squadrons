# Changing a template's ship count while ships exist

Issue: [#43](https://github.com/ThomasHendrickx/aeolus-fleet-squadrons/issues/43). Purpose retained and three integration decisions approved by Thomas on 20 November 2026, option 1 on each separate answer card, as relayed by orchestrator-1. The [existing approved design](template-count-changes.md) remains the source of truth; the [integration design](direct-starts.md) checks it against #33 without replacing those decisions or approving implementation.

## Purpose

A template owner can raise or lower how many ships a template allows while ships of it exist. Before confirming, they see what the change does. People keep using the ships they have, and new requests follow the confirmed count.

This is the already approved purpose. Together with starting one named ship from a template in #33, it lets people standardise ships without a later template version disrupting the ships they already use.

Thomas, 20 Nov, verbatim: "this one is a true enabler of standardising the ships".

## Lessons to check against

1. **Preserve the approvals already given.** PR #44 merged the design, not its implementation. Its recorded status distinguishes approved behaviour and screens from core contracts, rollout and #41 open proposals. Sources: [#44](https://github.com/ThomasHendrickx/aeolus-fleet-squadrons/pull/44), [#43 comment](https://github.com/ThomasHendrickx/aeolus-fleet-squadrons/issues/43), [approved design status](template-count-changes.md).
2. **Count a template across versions and forming paths.** The identity is fleet, configured repository and template name, without a version. Ships outside templates do not count. Direct starts in #33 must join the same count as blueprint members and individual asks. Sources: [#41, Durable requests and the count](../asking-for-a-ship/asking-for-a-ship.md#durable-requests-and-the-count), [approved #43 lessons 1 and 4](template-count-changes.md#lessons-to-check-against).
3. **A version proposes; the template owner decides.** The last confirmed count governs all versions. Reading a tag, removing a version or moving a tag must not silently change it. Only the template owner approves or declines; the newest available version determines the current proposal. Sources: [approved questions 1, 2 and 8, D1 to D5](template-count-changes.md).
4. **Lowering preserves ships and their work.** No automatic retirement or crew release, no notice pressing ship owners to retire, and no conversion of a bespoke ship to shared. When the held count is at or above the new limit, no new ship forms. The template's instructions determine the request's outcome. Sources: [approved question 4](template-count-changes.md#4-lowering-below-the-ships-that-exist), [#41 experience 13](../asking-for-a-ship/asking-for-a-ship.md).
5. **Raising and retries must preserve requests.** Waiting requests are offered newly available capacity oldest first, under fresh template instructions. Count changes and claims must agree, including uncertain commission outcomes and restarts. A crew release does not free the count. Sources: [approved questions 5 to 7](template-count-changes.md), [#41 answers 20 and 22](../asking-for-a-ship/asking-for-a-ship.md).
6. **Keep the page outside the console and enforce the actual reader's reach.** The template owner remains a person ship. The Squadrons page admits the identified owner for their template or a reader holding fleet:read; only that owner decides, without fleet:manage or a new scope. Core identity and reader-reach contracts are still separate design work. Sources: [approved S1, S1a, R1, R2 and E1 to E3](template-count-changes.md), [core compatibility brief](core-compatibility-brief.md), [core #1771](https://github.com/ThomasHendrickx/aeolus-fleet/issues/1771).
7. **Explain a real choice before asking for approval.** The existing screen audit required the version's file, commit and repository, when it was found, why it proposes a different count, and both approval and decline consequences. A known failed write and a lost answer are different facts; the latter must read the kept result before claiming success or failure. Source: [approved screen design and questions S3, D1 to D5](template-count-changes.md). These are recorded screen findings, not a completed production walk.
8. **Walk the candidate that will be released.** The release correction prevents publishing a rebuilt package after walking another candidate. Future evidence must demonstrate lowering, raising and recovery on the exact candidate, without claiming this document exercised those flows. Sources: [#57](https://github.com/ThomasHendrickx/aeolus-fleet-squadrons/issues/57), [fix #58](https://github.com/ThomasHendrickx/aeolus-fleet-squadrons/pull/58).

## Approved integration decisions

The existing purpose and approvals in [PR #44](https://github.com/ThomasHendrickx/aeolus-fleet-squadrons/pull/44) stand. Thomas answered the three integration questions on 20 November, one card each, option 1 each, as relayed by orchestrator-1:

1. **Direct starts count.** Ships started through #33 count in the same template count and show in the template owner's explanation of existing ships, subject to the approved reader-reach redaction.
2. **Scope of the next stage.** Check the approved #44 design against #33's direct starts and close the outstanding dependencies on #41 proposals 27 to 29 and core #1771, without new behavior. The integration design states exactly which part is settled and which approval or core contract is still required; a dependency is not declared approved by this answer.
3. **Before implementation.** Show how direct starts, forming a squadron, waiting requests and confirming a count all respect one count, preserve existing ships and handle unclear outcomes.

These decisions approve the integration design work, not the pending #41 proposals, core contracts, implementation or rollout. #33's separate ownership answer means the resulting ship belongs to the requesting ship, including an agent or app. The template owner remains the appointed person ship under #43's existing approved decision.

## Dependency on #33

#43 does not need #33 to change its purpose or already approved choices. It does need the direct-start path to supply the template association and obey the confirmed count once that path exists. #33 depends on #43's confirmed-count behaviour for starts after a change, and on the common #41 count across all versions and forming paths. Either purpose can be approved independently; implementation must not release a path that bypasses the other. The core identity and reader-reach addition in #1771 is a separate prerequisite for the approved owner page, not approval to implement #33 or #43.
