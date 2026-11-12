# Template ship count: API and identity

Issue: [#43](https://github.com/ThomasHendrickx/aeolus-fleet-squadrons/issues/43). Builds on [template-count-changes.md](template-count-changes.md) and its approved picks.

Status: a proposal for Thomas's approval. Every call, field and error code named here is proposed: none exists in core, pagasae or squadrons today. Nothing is built, granted or released by this document.

Thomas approved two picks, option 1 each, at commit 3a5076e, by answer `msg_01m77m5b8495e8hbbrfr89jrmj`, option 1, to question `157c6d2e-121d-4cc4-a875-47b1ba7a8ca7` (request `msg_01m77k8dsbqafxsx1jpfqzw10n`), relayed by the orchestrator ship:
- **A3 and A3b:** counted ships outside the reader's reach show as redacted rows, and the count stays exact.
- **O1:** the owner's ship is checked active within the same request, with the retirement window disclosed.

Thomas then approved option 1 of I1 to I4, A1, A2, C1, P1 and K1 to K6 at commit 7ad67ec, as squadrons' behaviour. That was answer `msg_01m77mjfz62q2wjx3t4ms455j0`, option 1, to question `24c2f55f-90d7-4e88-b829-4a8e3aa8e377` (request `msg_01m77mb7vbs65jgtrgr3r5t874`), relayed by the orchestrator ship.

These approvals exclude:
- the exact core endpoint and schema;
- account-token, on-behalf and bulk-read compatibility, which is core's, in [core-compatibility-brief.md](core-compatibility-brief.md);
- the new-page screens other than `owner-redacted`;
- any implementation.

## Purpose

The approved picks say who may read the Squadrons page for a template, who may approve or decline, and what the page must never claim. This design proposes how that is made true:
- how squadrons learns, checked by core, which person is signed in;
- how it authorises each template's page and each decision;
- how a decision is written once, answered once, retried safely, and reported truthfully after an ended sign-in or a lost answer.

## What it must keep

From the approved picks and the decisions they rest on:

1. **The template owner is a person ship** (S1a, question 8, #41 answer 16). Squadrons learns the signed-in person's ship through a checked core compatibility addition, never from an unchecked claim.
2. **Reading:** a holder of `fleet:read`, or the identified template owner, for that template only (R1).
3. **Deciding:** only the identified template owner of that template, with no `fleet:manage` and no new scope (R2). Core's own checks stay as they are.
4. **No rights travel with a message, and squadrons holds no person's crew token** (0017, 0046). For a person, squadrons serves only what that person may read (0017).
5. **One account sign-in** through pagasae, for every app (0054, header design H5). Core checks an account token on every call and stores no account (0058).
6. **Durable truth** (questions 6 and 7): a decision is written in the same lock as the claims, and shown only after it is written. "Written" or "not written" after an unknown outcome rests on a record tied to that one decision. "Nothing was written" rests on a server contract that is enforced and tested.
7. **Core stays content-blind** (0017): core learns nothing about templates, counts or decisions.

## Who owns what

| Part | Owner | What it does here |
| --- | --- | --- |
| Account sign-in and account tokens | pagasae | Signs the person in once (H5). Gives squadrons' server an account token for the fleet in view. |
| Checking an account token and answering its checked claims | core (aeolus-fleet) | The proposed identity call (I1). It answers who the token's account is, its person ship and its scopes, and nothing about templates. |
| Template owner record, counts, proposals, decisions, keys, outcomes | squadrons | All authorisation of the page and of decisions (A1 to A3), and every write (K1 to K5). |
| The Squadrons page | squadrons | Built like every Aeolus web app (header design H3), in this repository. It calls only squadrons' own API. |
| The console's link to the page | aeolus-fleet console | E1: a link, shown to those who can read the console's template page today. |
| Squadrons in the switcher | squadrons manifest, pagasae's app list | E2: listed for those the manifest's rights allow (H1, H4). |
| How the fleet names a template owner | #41 (answer 16) | Not designed here. This design reads that record. |

## Flow

```mermaid
sequenceDiagram
    actor Person
    participant Page as Squadrons page (browser)
    participant SQ as squadrons server
    participant PG as pagasae
    participant Core as core
    Person->>Page: Open /templates/baker (a link)
    Page->>SQ: Read the template's page
    SQ->>PG: Account token for this fleet, from the shared sign-in (I2)
    alt Not signed in
        PG-->>SQ: No sign-in
        SQ-->>Page: Signed out: sign in, then return here
    else Signed in
        PG-->>SQ: Account token
        SQ->>Core: Checked claims of this token (I1), with squadrons' crew token
        Core-->>SQ: account, person ship, scopes; or UNAUTHORIZED
        SQ->>SQ: Read rule A1 (fleet:read, or the template owner of this template)
        SQ-->>Page: The page, or no access
    end
    Person->>Page: Approve, allow 1
    Page->>Page: Make a decision key (K1)
    Page->>SQ: Decide with that key
    SQ->>Core: Checked claims (I1), before any write
    alt Token ended or refused
        SQ-->>Page: UNAUTHORIZED, nothing written (contract C1)
    else Checked
        SQ->>SQ: Owner ship status (O1), then one transaction: lock, key, owner, current proposal, write (K3)
        SQ-->>Page: Written, or refused with the reason
    end
    opt No answer reached the page
        Person->>Page: Sign in again, or Read the count again
        Page->>SQ: Outcome of that key (K4)
        SQ-->>Page: Written, or not written and now closed
    end
```

## Identity

**I1. How does squadrons learn, checked by core, who is signed in?**

1. **A core call that answers the checked claims of a presented account token.** Squadrons calls it with its own crew token in `Authorization` and the person's token in `Aeolus-Account-Token`, as core already accepts for an account presented by a ship (architecture.md, Actors). Proposed shape:
   - Input: none beyond the two headers.
   - Output: `fleetId`, `accountId`, `personShipId` (or null when the account has none), `scopes` and `endsAt`, all from the checked token.
   - Refusals: `UNAUTHORIZED` for a token core does not accept (signature, issuer, fleet, end, cut-off), as on every call.

   It answers only the token's own claims, reads nothing else and writes nothing.
2. **Present the token on an existing account-accepting call, and trust its signed claims once core accepts it.** Core checks the signature on every call, so an accepted token's claims are pagasae's. No new core code, but the guarantee is a side effect, not a stated contract.
3. **Squadrons checks pagasae's signature itself**, holding pagasae's keys as core does.

**Pick: 1. Approved.** It is the "checked core compatibility addition" S1a approved: one explicit, testable contract. Squadrons parses no token. Option 2 builds an identity guarantee on a side effect that a later core change could drop without noticing. Option 3 makes squadrons a second token checker, which 0017 does not give it and 0058 gives core.

What option 1 needs, outside this repository:
- **A core design and issue** in aeolus-fleet: the call's name, schema in `@aeolus-fleet/common`, refusals and tests.
- **A core release** carrying it.
- **A compatibility row change:** aeolus-fleet's `docs/compatibility.md` lists the call for squadrons. The same change fixes the known omission of `console.session` in squadrons' row.
- **A minimum core version:** squadrons raises `MINIMUM_CORE_VERSION` in the same pull request that first calls it.

**I2. How does squadrons' server get the person's account token?**

1. **From pagasae, server to server,** using the shared sign-in cookie on the shared Aeolus domain, for the fleet in view, as every Aeolus app's server does (0054, H5). The token stays on squadrons' server and is never sent to the browser.
2. **The browser sends the token** to squadrons with each call.

**Pick: 1. Approved.** It is how 0054 says every app gets account tokens, and it keeps the token off the page. It needs:
- **A pagasae issue:** squadrons' page as an app of the shared sign-in.
- **Hosting:** squadrons' page on the shared domain.

**I3. When is identity checked?**

1. **On every request** to squadrons' API: squadrons calls I1 with a token pagasae gave, never past the token's `endsAt`.
2. **Once per page session**, cached for some minutes.

**Pick: 1. Approved.** A decision must be checked at the moment it is made (contract C1), and a token lives 10 minutes at most (0058). The cost is one core call per squadrons request. It must stay within the page's read budget (p95 under 100 ms), to be measured when built.

**I4. What about a sign-in with no account?** That is argo or the viewer through `console.session`, or a fleet with no pagasae.

1. **Such a session reads with `fleet:read`, through the existing `console.session` check, and never decides.**
2. It is not served.

**Pick: 1. Approved.** It matches question 8: argo never decides, and a fleet without pagasae has no person to be template owner, so its count stays as last approved.

## Authorisation in squadrons

Squadrons keeps, per fleet and template identity, the template owner as a person ship id, set as #41 answer 16 decides. On each request it reads whether that ship is retired with `fleet/ship`, a call already listed for squadrons. A retired owner means no template owner.

**A1. Reading a template's page.**

1. **Allowed when the checked scopes hold `fleet:read`, or the checked person ship is that template's owner and is not retired.** Only that template: an owner without `fleet:read` gets no template list, no catalogue and no other template. The waiting count and the actions go to the owner only (S5).
2. Allowed for the owner of any template, across the catalogue.

**Pick: 1. Approved.** It is R1 as approved: "for that template only".

**A2. Approving or declining.**

1. **Allowed only when the checked person ship is that template's current owner,** checked inside the decision's transaction, after the lock (K2). No `fleet:manage`, no scope. Refused as `NOT_TEMPLATE_OWNER`, with nothing written.
2. Checked once before the transaction.

**Pick: 1. Approved.** A template owner the fleet replaced a moment ago cannot slip a decision in between the check and the write (the `refused` screen).

**A3. Which read gives each reader the ships' details?**

The identity call (I1) answers who the person is and their token's scopes. It is not read reach. A1 uses its scopes only to decide whether the page may open. What each reader then sees of each counted ship comes from core reads, under contracts that exist today:
- **A reader holding `fleet:read` by account:** squadrons presents their account token, with its own crew token, on `fleet/list` with `shipIds`. Core authorises the account by its own scopes and reach (architecture.md, Actors).
- **An owner without `fleet:read`:** squadrons reads as itself, with `fleet:read` and `fleet:on-behalf` and the `Aeolus-On-Behalf-Of` header naming their person ship, on `fleet/list` with `shipIds`. Core answers what that ship's read reach gives (architecture.md, fleet procedures; decision 0034; 0017's "reads on behalf of the person's ship").
- **argo or the viewer through `console.session`:** squadrons reads as itself. Both read the whole fleet already.
- **Whether the template owner's ship is retired:** squadrons reads it as itself with `fleet/ship`, for its own check only. The page shows only "No template owner".

1. **Account-token reads for an account that holds `fleet:read`, and reads on behalf of the person ship for an owner without it.**
2. Reads on behalf of the person ship for everyone.

**Pick: 1. Approved.** Each reader sees what core lets that actor see. The person ship's reach can differ from the account's, which also reaches by its token's group values, so option 2 could show a reader less, or more, than core gives them.

What core answers today: `fleet/list` answers a ship outside the caller's read reach by id, name, type and status only (`shipOutsideReadReachSchema`, `@aeolus-fleet/common`). It gives the owner (`ownerShipId`) only for ships within reach.

**A3b. How does the page show a counted ship outside the reader's reach?** Drawn as `owner-redacted`.

1. **"A ship you can't see":** it counts, with no name, owner, version, how it was formed or when. The section says how many are hidden.
2. The name and status core gives for a ship outside reach, with "Answers for it: not shown to you", and no squadrons detail.
3. Every name and owner from squadrons' own records. This needs 0017 changed.

**Pick: 1. Approved.** It shows the least, and the count is still exact, as approving needs. What it still reveals: how many ships count, and so how many the reader cannot see. That leak comes with showing an exact count to someone with narrower reach, and the template owner needs the count to decide. Option 2 also reveals names, which core does give to an on-behalf reader. Option 3 changes 0017.

This changes what the approved owner view showed: names and owners for every counted ship. It does so only for an owner without `fleet:read`, and only for ships outside their reach. Readers holding `fleet:read` see what their reach gives, as before.

**Compatibility requirements, separate from I1.** Each is a change to aeolus-fleet's `docs/compatibility.md`, with core confirming or adding the behaviour:
- squadrons presenting an account token on `fleet/list`;
- squadrons sending `Aeolus-On-Behalf-Of` on `fleet/list`. 0017 states it, but squadrons' row does not list it;
- reading a given set of ships by id, on behalf or with an account token, without listing the whole fleet. `fleet/list` already has a `shipIds` filter (`fleetListFilterSchema`). The core brief asks core to confirm its behaviour and limit for these readers.

## Decisions: one write, one answer

Squadrons' own API for the page. The procedure names are proposed:
- `templateCount.read({ repository, template })`: the page.
- `templateCount.decide({ repository, template, proposal: { version, commit, statedCount }, decision: 'approve' | 'decline', decisionKey })`: one decision.
- `templateCount.outcome({ repository, template, decisionKey })`: what became of one decision.

"Leave declined" calls nothing and records nothing (D2).

**C1. Server contract: identity before any write.** Approved as squadrons' behaviour; to be enforced and tested. `decide` calls I1 first and opens no transaction until it answers. A refused or ended token answers `UNAUTHORIZED`, meaning only that this request wrote nothing. It says nothing about an earlier request with the same key, because the key is never looked up before identity. A test must prove that a refused token leaves no decision and no key.

**P1. When the page may send a key again.** Approved. Only after a definite "wrote nothing" answer to every earlier send of that key: a squadrons refusal, or `UNAUTHORIZED`. After a send whose outcome is unknown (no answer), the page never sends that key again; it asks `outcome`. So:
- `UNAUTHORIZED` on a key's first send, or after only definite refusals, shows `expired-refused`: "refused this request before writing anything".
- `UNAUTHORIZED` after an unknown send of that key shows the outcome-unknown flow (`expired-unknown`), never `expired-refused`.

**O1. Where the owner's ship status is checked.** Squadrons cannot lock core's ships, so no check of `fleet/ship` can be atomic with squadrons' transaction.

1. **Read it within the request, after I1 and before the transaction, and record the status read with the decision.** The guarantee: a decision is accepted only from the person squadrons holds as template owner at commit, checked under the template lock, whose ship core answered as active during that same request. A retirement core commits after that read and before squadrons' commit is not seen by that decision. The window is one request, and the decision records what was read.
2. Read it inside the transaction, after the lock. That narrows the window, but holds the claims lock across a core call.
3. Learn retirements from core events. No such event is listed for squadrons.

**Pick: 1. Approved.** It names a guarantee squadrons can keep. Option 2 makes every claim on that template wait on core's answer. Retirement changes no claim: the ships stay, and only who may decide changes.

**K1. Who makes the decision key?**

1. **The page,** a new random id for each decision it is about to send, kept until it has an answer.
2. Squadrons issues one in an extra call first.

**Pick: 1. Approved.** The page knows the key before it sends, so a lost answer leaves it something to ask about (K4), with no extra round trip.

**K2. What a key is bound to.** Approved. A decision key is one value within its fleet, template identity (repository and template name, as the count is) and the actor's checked person ship. The same value made by another person, or for another template, is a different decision: the unique index is on all four. `decide` and `outcome` both name the template, so both find the same key.

**K3. The decision's transaction.** Approved. `decide` runs C1, then O1, then one transaction, in this order:
1. Lock the template's count row for that fleet and template identity, the same lock as claims (question 6). With no such row, refuse `TEMPLATE_UNKNOWN`, writing nothing.
2. Look up the key by its four-part index:
   - written with the same content: answer the stored outcome;
   - written with other content: refuse `KEY_REUSED`;
   - closed (K4): refuse `KEY_CLOSED`.
3. Check A2 against squadrons' own template owner record, which only changes under the same lock.
4. Check the proposal is still the current one (D3, D5): same version, commit and stated count. If not, refuse `PROPOSAL_CHANGED` and answer the current state.
5. Write the decision with its key, actor, account, proposal, the count before and after, the time, and the owner ship status O1 read. On approve, write the new count in force. Then commit.

Any refusal writes nothing. The answer is sent only after commit, so "Approved" never shows before the write (question 7).

**K4. What does the outcome call answer?**

1. **A closing read, in the same lock order as `decide`.** It runs I1, then locks the template's count row, then looks up the key under the caller's own person ship:
   - written: it answers "written", with the stored decision;
   - not written: it writes the key as closed in that transaction and answers "not written". A `decide` still on its way with that key then waits on the same lock and is refused `KEY_CLOSED`, so "not written" is final.
   - no count row for that template: it answers "no such decision" and writes nothing.
2. A plain read. "Not written" can turn into "written" if the original request was still on its way, so the page could only say "not yet".
3. No outcome call. The page only offers to try again with the same key.

**Pick: 1. Approved.** It is the only option that lets the page say "not written" truthfully (`return-not-written`). Option 3 would replay a decision the person may no longer want, which question 7 and the screens rule out.

**K5. How long are keys kept?**

1. **With the template's decision history, for as long as squadrons keeps the fleet,** closed keys included. The outcome call stays answerable.
2. For some days. Afterwards the outcome is "can't be told".

**Pick: 1. Approved.** A decision is rare and small, and an answer that changes with time is the ambiguity this design removes. Under this pick, `return-unknown` shows only when the outcome call itself cannot be answered, such as when squadrons does not answer.

**K6. Who may ask about a key, and what does absence reveal?**

1. **Only the person ship that made it.** The outcome call needs I1 but not A1, so a former template owner can still learn what became of their own decision. It answers only within the caller's own keys. "No such decision" reads the same whether the key was never used, was used by someone else, or names a template squadrons does not serve. A key it closes is the caller's own and invisible to anyone else.
2. Anyone who may read the page.

**Pick: 1. Approved.** A key is the person's own attempt, and the answer reveals nothing about anyone else's.

### Retries and the screens

- **Failed write** (`failed`): squadrons answered that it wrote nothing. Try again resends with the same key, which is safe under K3.
- **Lost answer** (`lost`): "Read the count again" calls `outcome` first. On "not written", a new attempt uses a new key, because the old one is closed.
- **Sign-in ended, refused** (`expired-refused`): `UNAUTHORIZED` under C1, on a key with no unknown earlier send (P1). Sign in again, then decide again. The same key is safe, because every send of it so far wrote nothing.
- **Sign-in ended after an unknown send:** the outcome-unknown flow below, never `expired-refused` (P1).
- **Sign-in ended, no answer** (`expired-unknown`): after signing in, the page calls `outcome` and shows `return-written` or `return-not-written`. If the outcome call cannot be answered, it shows `return-unknown`.
- **Nothing is ever resent by itself.** Only the person's own Try again resends.

## Separate work this needs

Not filed here. Each comes back as its own issue once this design is approved:
1. **aeolus-fleet core:** the identity call (I1), with its common schema, release and compatibility row. Also the read requirements under A3: account tokens and `Aeolus-On-Behalf-Of` on `fleet/list` for squadrons, and its `shipIds` filter for these readers. All of it is set out for its own issue in [core-compatibility-brief.md](core-compatibility-brief.md). And the fix to the missing `console.session` line in squadrons' row. The call's name and schema are core's design to settle.
2. **pagasae:** squadrons' page as an app of the shared sign-in (I2), and Squadrons in the app list for the switcher (E2, H1).
3. **aeolus-fleet console:** the link on the template page (E1).
4. **#41:** how the fleet names and changes a template owner (answer 16), which this design reads.
5. **squadrons:** the page app, the API above, the count and decision tables and their migrations. One part at a time, after approval.

## Guarantees to prove when built

Each comes with a test, as CLAUDE.md requires:
- A refused or ended token writes nothing (C1).
- Two decisions racing on one template: one writes, and the other is refused `PROPOSAL_CHANGED` or sees the first's outcome.
- The same key twice writes once and answers the same outcome. Other content under that key is refused.
- An outcome read racing a late decide: either "written", or "not written" with the late decide refused `KEY_CLOSED`. Never both.
- A restart between commit and answer: the outcome call answers "written".
- The template owner changed mid-decision: `NOT_TEMPLATE_OWNER`, nothing written.
- An owner without `fleet:read` reads only their own template's page, and a counted ship outside their reach shows only as "A ship you can't see" (A3b).
- `UNAUTHORIZED` writes nothing in that request, even when an earlier request with the same key had written (C1, P1).
- The same key value from another person or for another template is a separate decision. "No such decision" is the same answer for a key never used and for someone else's (K2, K6).
- A decision records the owner ship status read in its request (O1).
