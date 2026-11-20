# One template count, including direct starts

Integration for [#43](https://github.com/ThomasHendrickx/aeolus-fleet-squadrons/issues/43), following the [three approved integration decisions](stage-1.md#approved-integration-decisions). The [approved count design](template-count-changes.md) and [API and identity decisions](api-and-identity.md) govern. The [#33 detailed design](https://github.com/ThomasHendrickx/aeolus-fleet-squadrons/blob/design/33-start-one-ship-stage-1/docs/design/start-one-ship/detailed-design.md) adds the named direct-start path. Thomas answered the four #41 dependencies on 20 November, one card each, option 1. Core contracts and implementation remain separate dependencies.

## The same identity and held places

One count belongs to one fleet, configured repository identity and template name. Its version, built hash, base chain, chosen ship name, owner and forming path do not open separate places. A derived template has its own template identity, not its base's identity. A non-template ship does not count. The flagship has no template and does not consume a member-template place.

Each forming path keeps the template identity, exact version and built snapshot with its ship association and creation claim before commission:

| Path | Places claimed | What remains different |
| --- | --- | --- |
| #33 direct start | One, before commissioning the chosen name | No blueprint or flagship. The requester supplies missing values and direct hand-offs. No business request is implied. |
| #41 individual ask | One when its template instructions call for a new ship | An existing ship receiving another request consumes no new place. Keep the request, case outcome and private conversation. |
| Blueprint forming | Every required member place, all or none before any member commission | Keep the blueprint snapshot, flagship and squadron check-in. No partly admitted blueprint evades the count. |
| Add blueprint member | The added member's place before commission | Keep the existing squadron. Do not recount existing members as new claims. |

Held places include confirmed, unretired ships and creation steps whose commission result is unknown. A confirmed ship and its creation step describe one place, not two. Commission success turns that existing claim into the ship association; it does not increment another counter. Crew release, no matching computer, completed work or a restart leaves the place held. Confirmed retirement or confirmed failed commission frees it. Existing template-formed ships must be associated and uncertain creation attempts reconciled before enforcement is enabled for their template. Otherwise the count would start by ignoring them.

The new ship's owner is the ship that asked for it, whether a person ship, agent or app, under Thomas's #33 correction. The template owner is the appointed person ship authorised to change the count. These are different roles. A template-owner decision changes neither ownership nor the ships' requests, crew, snapshots or bespoke/shared kind.

## Four paths through one count

```mermaid
flowchart TD
    D[33 direct start: keep exact template and start key] --> S[Squadrons shared claim transaction]
    B[Blueprint or added member: keep snapshot and required places] --> S
    W[41 waiting requests: offer available places oldest first with fresh case facts] --> S
    S --> L[Lock count rows for required template identities]
    L --> Q{All required places fit the confirmed counts?}
    Q -- no --> N[Claim nothing new; apply that path's approved outcome]
    N --> DN[Direct start: explain no ship can form now; no automatic waiting]
    N --> WN[41 follows template instructions; waiting stays private]
    N --> BN[Blueprint: refuse before commission and name templates without places]
    Q -- yes --> K[Commit all claims and creation steps together]
    K --> C[Commission with stored stable keys outside count locks]
    C -- confirmed ship --> H[Same place now references the commissioned ship]
    C -- unknown outcome --> U[Keep place held; reconcile same key after restart]
    U --> C
    C -- confirmed no ship --> F[Release that claim]
    H --> R[Crew request, crew and instructions; place remains held]
    R -- crew released or work ends --> H
    R -- explicit retirement confirmed --> F
    F --> W
    O[Template owner approves or declines with decision key] --> I[Check identity and authority; lock same template count row]
    I --> V{Same current proposal and authorised template owner?}
    V -- no --> X[Refuse; no count or ship change]
    V -- yes --> T[Commit decision and confirmed count atomically]
    T -- lowered --> E[Keep all prior claims and existing ships; later claims see lower count]
    T -- raised --> W
    T -- answer lost --> A[Read outcome for this key; never infer result from count alone]
```

Neither direct starts nor blueprints may commission without a place. A full direct start explains that no ship can form now and creates no automatic waiting request. A full blueprint is refused before member commission, naming templates without enough places. Waiting requests retain the approved oldest-first offer flow; admission and offers must be coordinated before building an allocator.

## Ordering and uncertain outcomes

Count confirmation and place claiming take the same per-template lock. The local transaction contains only squadrons state; no core network call holds that lock. For a blueprint requiring several templates, the proposed transaction takes those locks in one stable identity order. The #41 shared-count proposal requires all places or none. A stored creation key is used outside that transaction for commission. Core and squadrons have no cross-database transaction.

| Concrete race or failure | Outcome required by the approved design |
| --- | --- |
| Limit 3, held 2; direct claim commits, then owner confirms 1 | The third claim continues, even if commission has not answered. All three count. New claims see 1 and cannot commission. No rollback is performed to meet the lower number. |
| Same facts; confirmation commits before the direct claim | The direct claim sees 1 with 2 held and cannot obtain a place. Existing ships keep working. Explain that no ship can form now; create no automatic waiting request. |
| Limit 1; direct start and #41 new-ship ask race | At most one claims the place. The other follows its path's no-place outcome. A new version or different requester cannot bypass the claim. |
| Blueprint needs two places; only one is free | No partial claim or member commission. Refuse and name the templates without enough places; create no implicit queue. |
| Limit raised while waiting requests exist | Commit the count and durable offer work. Offer waiting requests oldest first, reapply their recorded template instructions with fresh facts and use the same claim. If the case ship is unavailable, keep that request visibly waiting; do not guess its instructions. |
| Process dies after raise, before offering | Resume kept offer work. A retried offer finds its existing request/claim and never allocates a second place. |
| Commission succeeds but its answer is lost | Keep its claim and stable key until reconciled. Do not count it twice or free it based on a failed lookup. Lowering in the meantime preserves it. |
| Crew request fails or no computer can crew | The ship still exists and holds its place. Show the crew-request failure and let the requester retry; the ship and claim remain. |
| Explicit release, then explicit retirement | Release frees nothing. Only confirmation of retirement frees the place and enters the existing waiting-offer flow. |
| Owner approves, answer is lost, then a different count is confirmed | Query the original decision key. The current count alone proves neither the first decision nor its absence. |
| A late decide arrives after an outcome read says not written | The closing outcome transaction has closed that key under the same lock; the late decide is refused `KEY_CLOSED`. |
| A new tag appears, is moved or disappears during a decision | Apply the approved current-proposal/version/commit checks and refuse stale decisions. The confirmed count never silently follows a tag. |
| Ship belongs to an agent or app requester | It holds the same place. Only the appointed template owner may decide the count. Core ownership support is a #33 prerequisite, not a second count or a reason to omit the ship. |

A decrease never converts a bespoke ship to shared. Counts and capacity are facts; an existing-ship or conflicting-work outcome remains the template's instructions, interpreted by the approved case mechanism when available. The count page neither reads nor chooses that business policy.

## Owner explanation and screens

The already approved page lists held places with version and forming path, within the reader's reach. A directly started ship is labelled as a direct start alongside an individual ask or blueprint member. It is not made into a fake squadron row. An unknown commission remains a creation in progress and counts. The owner shown is the actual requesting ship under #33; a person ship is not substituted for an agent or app.

A ship outside the reader's reach stays "A ship you can't see", with no owner, name, version, forming path or timing. Its place still counts. Waiting is only a number, never anyone else's request. Lowering and raising explanations, confirmation buttons, shared sign-in, failures and decision-key recovery use the existing approved states. The before/after data mockups for the direct-start row are embedded in PR #62, not delivered as external artifacts. They add no new screen layout or control.

At 3,000 ships and 10 million messages per fleet, the page reads the current count rollup and one database-cursor page of 20 held places, with exact indexed identity/claim lookups. It never reads the whole fleet or message history. Core reads only the referenced ship ids, under the reader contract once #1771 is resolved. No request content is included. Keep the existing p95 below 100 ms, p99 below 500 ms and error rate below 1% targets; measurement is required when built, not claimed here.

## Dependency resolutions and remaining contracts

The four #41 choices are approved. The core contracts named below still require their own design and approval.

| Dependency | Integration resolution | Still required before the affected slice |
| --- | --- | --- |
| #33 association and count | A direct start records the same template identity and uses the shared claim. Count-page explanations include it under existing reach rules. Thomas approved this integration on 20 November. | Build the common association and claims before enabling any direct-start count enforcement. Apply the approved no-place explanation without creating a waiting request. |
| #41 proposal 27, named case ship | Only the waiting/existing-ship paths that need template interpretation depend on this agent. A count change commits without asking that agent; offer work waits durably if it is absent. The agent cannot claim, approve powers or change a count. | One `squadrons-requests` case ship per fleet, owned by the ship that set it up, with send and receive rights only. Core must design requesting-ship ownership under 0045; no commission follows from this design approval. |
| #41 proposal 28, recorded rights approval | The shared allocator claims capacity; core separately checks powers at commission. A changed built hash may require another approval but opens no new count identity. Withdrawal blocks the affected new commission and frees a place only after confirmed no ship. | Approval holds until withdrawn and binds one exact built template. Core/common contract and release for #1745, compatibility and any 0045/0046 amendments remain required. |
| #41 proposal 29, instruction hand-over | Commission and its count claim precede instructions. Direct and #41 formed ships use one agreed hand-over; confirmation never frees a place or means work started. | Send instructions before work and await confirmation by the current crew; repeat for replacement crew. A core design must provide current-lease proof sufficient to reject stale confirmations. |
| Core #1771 N1, checked identity | The page must get core-checked account/person-ship claims before writing, as approved I1/C1. The plugin's own `whoami` is not that identity. | Core designs and publishes the identity call and common schema. #1771 is open; no call name or signature is invented here. |
| Core #1771 N2 to N4, reader reach | Use only page ship ids with `fleet/list` under the account or on behalf of the checked template owner, then redact outside-reach rows as approved A3b. | Core confirms account-token presentation, `Aeolus-On-Behalf-Of`, the `shipIds` filter and limits in squadrons' compatibility row. `fleet/list` alone in that row does not establish these modes. |
| Core #1771 N5, console session | Argo/viewer entry uses the already designed console-session boundary. | Core corrects the missing squadrons `console.session` compatibility entry. No unapproved partial rollout follows from that correction. |
| #33 requesting-ship ownership and manage reach | Count accepts agent/app owners without substitution; template-owner decision authority remains the appointed person ship. Crew requests still need core manage reach. | Core must design ownership by any requesting ship under 0045 and the 0017 owned-label and declared manage-reach extension restricted to ships squadrons forms. The manage contract needs its own approval. Both block affected implementation. |
| Existing full-blueprint proposal in #41 | Required member places are all or none. A count change cannot partially admit a squadron. | Refuse before any member commission, naming templates without enough places; no implicit queue. |

For core, the existing read is `fleet/ship` for O1's template-owner status, and `fleet/list` for the referenced ship page once #1771's modes are confirmed. Commissioning, crew requests, send/receive/ack and any retire read are the calls in [compatibility](https://github.com/ThomasHendrickx/aeolus-fleet/blob/588e69d6abbef76cab684c9d0367cb9aaf30f488/docs/compatibility.md), as enumerated in #33's core-call table. `templateCount.read`, `decide` and `outcome` in [the approved API design](api-and-identity.md#decisions-one-write-one-answer) belong to squadrons, not core. No core endpoint manages a template count.

Core must publish the required calls, semantics and common schemas, then update compatibility with actual releases. Squadrons raises `MINIMUM_CORE_VERSION` in the first implementation PR using them. The app entry, shared sign-in and console's existing approved link remain separate work. Their presence does not approve a rollout without the identity/reach contract.

## Build slices and evidence

No implementation starts merely because this stage is written. Core designs and contracts still need their own approvals:

1. **Common association and count claims.** Use one fleet/template rollup, associate existing ships and reconcile unknown commissions. Connect direct starts, blueprint forming and #41 creation to the same claim. Prove all-or-none multi-template claims, version independence, claim/confirm races, restart and retirement versus release.
2. **Count read and decision transaction.** Implement the already approved API and identity behavior after core #1771. Prove current-template-owner checks, fleet isolation, a decision's exact version/commit, key reuse, lost answers and closing-outcome races. Keep account and reader reach authoritative.
3. **Durable waiting offers.** Persist the count change and offer work together. Prove raise/restart, duplicate offers and fresh claim checks, with the approved case ship and instructions once the required core contracts are in place. Preserve waiting oldest-first; no direct-start exemption or new queue policy is introduced.
4. **Approved page and entries.** Use the existing screens and shared sign-in contracts, with direct-start data in the existing row. Prove hidden-ship redaction, no request-content leak and known refusal versus unknown decision outcome. Walk before/after data at the approved desktop and phone sizes.
5. **Integrated release walk.** On the exact candidate to publish, start directly, form a squadron, lower below held places, release without freeing, explicitly retire, raise with waiting requests, lose a commission answer and lose a count-decision answer. Verify actual crew instructions and private outcomes as well as page numbers. No partial rollout or automatic lifecycle action is implied.

Each production slice begins with a separate failing-test commit ending `(red)`, then implementation. Run only its touched tests locally; CI judges the rest. This documentation supplies scenarios, not runtime evidence or a new test process.

## Decisions answered 20 November

Thomas answered one card per dependency, option 1 for each:

1. **Proposal 27:** One `squadrons-requests` case-handling ship per fleet, with send and receive rights only, owned by the ship that set it up.
2. **Proposal 28:** A recorded approval holds until withdrawn and binds one exact built template.
3. **Proposal 29:** Hand over instructions by message and await confirmation by the current crew before work; repeat for replacement crew.
4. **Full blueprint:** Refuse before any member commission, naming the templates without enough places.

Core must design ownership by any requesting ship under 0045, current-lease proof, and the 0017 manage-reach extension. Those contracts need their own approval. Core #1771 remains a separate identity and reader-reach dependency. These decisions do not approve implementation or rollout.
