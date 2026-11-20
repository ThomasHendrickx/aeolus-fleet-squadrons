# Start one ship from a template

Issue: [#33](https://github.com/ThomasHendrickx/aeolus-fleet-squadrons/issues/33). Purpose and decisions approved by Thomas on 20 November 2026, purpose card `bd4c6b9e` and five separate answer cards relayed by orchestrator-1. Each answer selected option 1, with the ownership correction below. The [detailed design](detailed-design.md) builds on those decisions; its new proposals and implementation are not approved.

## Approved purpose

A requesting ship starts one ship from a template version, gives it its own name, and gets it crewed with the template's charter, scopes and crew settings, without making a blueprint or getting a flagship. A company's orchestrator can be a ship with a stable name, made from the same versioned template as other ships doing that work.

Thomas, 20 Nov, verbatim: "this one is a true enabler of standardising the ships".

## Lessons to check against

1. **Remove the workaround the person has today.** #33 records that starting one ship currently needs a one-role blueprint, a flagship and a member name containing a random squadron id. The requester's chosen ship name is the outcome, not another way of preparing those parts. Source: [#33](https://github.com/ThomasHendrickx/aeolus-fleet-squadrons/issues/33).
2. **Use the complete template version.** Bases are built into a complete template with a recorded chain; forming keeps a snapshot and later file changes do not change existing ships. Starting directly must preserve charter, parameters, scopes, labels and crew settings. Source: [Files in git and Template bases](../../squadrons.md#files-in-git).
3. **Keep the ship distinct from a squadron role.** A hand-off is currently declared by a template and bound by a blueprint. The flagship supplies the charter at check-in. Removing both leaves real questions about hand-offs and how the crew receives its charter. Source: [Ship template](../../squadrons.md#ship-template) and [check-in](../../squadrons.md#check-in), [decision 0017](../../decisions/0017-squadrons-package.md).
4. **A name is a handle, not a new identity guarantee.** Names are unique among active ships, reusable after retirement and renameable; messages keep resolved ship ids. A chosen stable name cannot promise that a later ship inherits earlier messages. Source: [blueprint, Words and Registry invariants](https://github.com/ThomasHendrickx/aeolus-fleet/blob/main/docs/blueprint.md).
5. **Keep ownership, permission to ask and ship powers separate.** The ship requesting a ship's existence owns it, whether a person ship, an agent or an app; the fleet sets the template owner. This correction governs #33 even where the earlier #41 wording says person. Approved asking-for-a-ship choices distinguish asking rights and approved ship powers. Today's forming scope subset check is not permission to bypass core. Source: [#41 approved experience 8 and technical choices 16 to 19](../asking-for-a-ship/asking-for-a-ship.md), [forming by message](../../squadrons.md#forming-by-a-ship), [decision 0017](../../decisions/0017-squadrons-package.md).
6. **All forming paths consume the same template count.** Every version and forming path counts together by fleet, configured repository and template name. Crew release does not free a count; confirmed retirement or confirmed failed commission does. Source: [#41, Durable requests and the count](../asking-for-a-ship/asking-for-a-ship.md#durable-requests-and-the-count) and [#43 approved lessons and questions 4 to 7](../template-count-changes/template-count-changes.md).
7. **Crewed is not started.** Crew requests need suitable workspaces, the trierarch starts sessions, and firstPrompt is first-start only. Do not report work started merely because a ship was commissioned. Secrets never travel in forming messages. Source: [Crew settings](../../squadrons.md#crew-settings), [forming by message](../../squadrons.md#forming-by-a-ship), [#41 lessons 7 and 8](../asking-for-a-ship/asking-for-a-ship.md).
8. **Verify what will actually be delivered.** The release correction requires publishing the exact candidate walked on staging, rather than rebuilding it. A future walk of this feature must use the candidate being released and demonstrate one ship with its chosen name and actual template charter. This is a release lesson, not evidence that this feature has been walked. Source: [#57](https://github.com/ThomasHendrickx/aeolus-fleet-squadrons/issues/57) and [fix #58](https://github.com/ThomasHendrickx/aeolus-fleet-squadrons/pull/58).

## Approved decisions

Thomas approved the purpose above on 20 November, card `bd4c6b9e`. The owner in this purpose is the requesting ship, including when an account acts through its person ship. There is no blueprint, squadron or flagship.

Thomas answered each of the following on a separate card on 20 November, option 1 each, as relayed in this task. These are decisions, not unanswered questions.

1. **Inputs.** The requester chooses the template version, ship name and values the template still needs, using the template's crew settings. A requester can be a person ship, an agent or an app. Role and flagship settings are not inputs.
2. **Name in use and retry.** Say the name is in use and let the requester choose another. The existing ship is untouched. A retry of the same accepted start stays the same start.
3. **Hand-offs.** The requester names each destination directly, without a blueprint. Naming a destination grants no reach. The exact destination representation remains detailed design.
4. **Ownership.** The owner is the ship that asked for it, whether a person ship, an agent or an app. Thomas's note, verbatim:

   > The ship who asked for it. The spirit of the option I picked is correct, the wording is not. Reason is that an agent or an app can also do this, not only persons

   This does not mean the requesting ship's owner, the app operator or the template owner. Core's current ownership contract cannot yet express every approved case; see the detailed design's core gap.
5. **One template count.** A direct start counts under the same template count as every other way of forming ships. Selecting another version opens no separate place.

## Dependency on #43

#33 adds a forming path. #43 determines the confirmed count that this path must obey, including a reduction below existing ships. A direct start must appear among the ships counted and must not create an exception when another version is chosen. #43's purpose and existing approvals stand without #33; its implementation must include #33 once that path exists. #33 can have its purpose approved independently, but cannot ship a count bypass. Both rely on #41's shared template association and durable count claims. Core rights and identity dependencies stay separate design work.
