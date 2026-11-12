# Template ship count: API and identity

Issue: [#43](https://github.com/ThomasHendrickx/aeolus-fleet-squadrons/issues/43). Builds on [template-count-changes.md](template-count-changes.md) and its approved picks.

Status: a proposal for Thomas's approval. Every call, field and error code named here is proposed: none exists in core, pagasae or squadrons today. Nothing is built, granted or released by this document.

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
        SQ->>SQ: One transaction: lock, key, owner, current proposal, write (K2)
        SQ-->>Page: Written, or refused with the reason
    end
    opt No answer reached the page
        Person->>Page: Sign in again, or Read the count again
        Page->>SQ: Outcome of that key (K3)
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

**Pick: 1.** It is the "checked core compatibility addition" S1a approved: one explicit, testable contract. Squadrons parses no token. Option 2 builds an identity guarantee on a side effect that a later core change could drop without noticing. Option 3 makes squadrons a second token checker, which 0017 does not give it and 0058 gives core.

What option 1 needs, outside this repository:
- **A core design and issue** in aeolus-fleet: the call's name, schema in `@aeolus-fleet/common`, refusals and tests.
- **A core release** carrying it.
- **A compatibility row change:** aeolus-fleet's `docs/compatibility.md` lists the call for squadrons. The same change fixes the known omission of `console.session` in squadrons' row.
- **A minimum core version:** squadrons raises `MINIMUM_CORE_VERSION` in the same pull request that first calls it.

**I2. How does squadrons' server get the person's account token?**

1. **From pagasae, server to server,** using the shared sign-in cookie on the shared Aeolus domain, for the fleet in view, as every Aeolus app's server does (0054, H5). The token stays on squadrons' server and is never sent to the browser.
2. **The browser sends the token** to squadrons with each call.

**Pick: 1.** It is how 0054 says every app gets account tokens, and it keeps the token off the page. It needs:
- **A pagasae issue:** squadrons' page as an app of the shared sign-in.
- **Hosting:** squadrons' page on the shared domain.

**I3. When is identity checked?**

1. **On every request** to squadrons' API: squadrons calls I1 with a token pagasae gave, never past the token's `endsAt`.
2. **Once per page session**, cached for some minutes.

**Pick: 1.** A decision must be checked at the moment it is made (contract C1), and a token lives 10 minutes at most (0058). The cost is one core call per squadrons request. It must stay within the page's read budget (p95 under 100 ms), to be measured when built.

**I4. What about a sign-in with no account?** That is argo or the viewer through `console.session`, or a fleet with no pagasae.

1. **Such a session reads with `fleet:read`, through the existing `console.session` check, and never decides.**
2. It is not served.

**Pick: 1.** It matches question 8: argo never decides, and a fleet without pagasae has no person to be template owner, so its count stays as last approved.

## Authorisation in squadrons

Squadrons keeps, per fleet and template identity, the template owner as a person ship id, set as #41 answer 16 decides. On each request it reads whether that ship is retired with `fleet/ship`, a call already listed for squadrons. A retired owner means no template owner.

**A1. Reading a template's page.**

1. **Allowed when the checked scopes hold `fleet:read`, or the checked person ship is that template's owner and is not retired.** Only that template: an owner without `fleet:read` gets no template list, no catalogue and no other template. The waiting count and the actions go to the owner only (S5).
2. Allowed for the owner of any template, across the catalogue.

**Pick: 1.** It is R1 as approved: "for that template only".

**A2. Approving or declining.**

1. **Allowed only when the checked person ship is that template's current owner,** checked inside the decision's transaction, after the lock (K2). No `fleet:manage`, no scope. Refused as `NOT_TEMPLATE_OWNER`, with nothing written.
2. Checked once before the transaction.

**Pick: 1.** A template owner the fleet replaced a moment ago cannot slip a decision in between the check and the write (the `refused` screen).

**A3. The counted ships, for an owner without `fleet:read`.**

1. **Squadrons shows each counted ship as far as that person may read it, reading on behalf of their person ship (0017).** A ship outside their read reach still counts and shows as "A ship you can't see", with no name or owner.
2. Squadrons shows every counted ship's name and owner from its own records, read as itself.

**Pick: 1.** 0017 says squadrons serves a person only what that person may read. Option 2 would change that decision. A reader holding `fleet:read` sees what their read reach gives, as today. This adds one screen variant to draw once approved: an owner without `fleet:read` seeing "A ship you can't see" rows.

## Decisions: one write, one answer

Squadrons' own API for the page. The procedure names are proposed:
- `templateCount.read({ repository, template })`: the page.
- `templateCount.decide({ repository, template, proposal: { version, commit, statedCount }, decision: 'approve' | 'decline', decisionKey })`: one decision.
- `templateCount.outcome({ decisionKey })`: what became of one decision.

"Leave declined" calls nothing and records nothing (D2).

**C1. Proposed server contract: identity before any write.** `decide` calls I1 first and opens no transaction until it answers. A refused or ended token answers `UNAUTHORIZED` with nothing written. A test must prove that a refused token leaves no decision and no key. Only under this contract may the `expired-refused` screen say nothing was written.

**K1. Who makes the decision key?**

1. **The page,** a new random id for each decision it is about to send, kept until it has an answer.
2. Squadrons issues one in an extra call first.

**Pick: 1.** The page knows the key before it sends, so a lost answer leaves it something to ask about (K3), with no extra round trip.

**K2. The decision's transaction.** In one transaction, in this order:
1. Lock the template's count, the same lock as claims (question 6).
2. If the key is already written for this actor with the same content, answer the stored outcome. With other content, refuse `KEY_REUSED`. If the key is closed (K3), refuse `KEY_CLOSED`.
3. Check A2: the actor is the current template owner.
4. Check the proposal is still the current one (D3, D5): same version, commit and stated count. If not, refuse `PROPOSAL_CHANGED` and answer the current state.
5. Write the decision with its key, actor, account, proposal, the count before and after, and the time. On approve, write the new count in force. Then commit.

Any refusal writes nothing. The answer is sent only after commit, so "Approved" never shows before the write (question 7).

**K3. What does the outcome call answer?**

1. **A closing read.** Under the same lock it answers "written", with the stored decision, or "not written". When the answer is "not written", it closes that key in the same transaction, so a decide still on its way with that key is refused `KEY_CLOSED`. "Not written" is then final.
2. A plain read. "Not written" can turn into "written" if the original request was still on its way, so the page could only say "not yet".
3. No outcome call. The page only offers to try again with the same key.

**Pick: 1.** It is the only option that lets the page say "not written" truthfully (`return-not-written`). Option 3 would replay a decision the person may no longer want, which question 7 and the screens rule out.

**K4. How long are keys kept?**

1. **With the template's decision history, for as long as squadrons keeps the fleet,** closed keys included. The outcome call stays answerable.
2. For some days. Afterwards the outcome is "can't be told".

**Pick: 1.** A decision is rare and small, and an answer that changes with time is the ambiguity this design removes. Under this pick, `return-unknown` shows only when the outcome call itself cannot be answered, such as when squadrons does not answer.

**K5. Who may ask about a key?**

1. **Only the person ship that made it,** in that fleet. Anyone else gets "no such decision", which tells them nothing.
2. Anyone who may read the page.

**Pick: 1.** A key is the person's own attempt. A former template owner can still learn what became of their own decision, and nothing else.

### Retries and the screens

- **Failed write** (`failed`): squadrons answered that it wrote nothing. Try again resends with the same key, which is safe under K2.
- **Lost answer** (`lost`): "Read the count again" calls `outcome` first. On "not written", a new attempt uses a new key, because the old one is closed.
- **Sign-in ended, refused** (`expired-refused`): `UNAUTHORIZED` under C1. Sign in again, then decide again with a new key.
- **Sign-in ended, no answer** (`expired-unknown`): after signing in, the page calls `outcome` and shows `return-written` or `return-not-written`. If the outcome call cannot be answered, it shows `return-unknown`.
- **Nothing is ever resent by itself.** Only the person's own Try again resends.

## Separate work this needs

Not filed here. Each comes back as its own issue once this design is approved:
1. **aeolus-fleet core:** the identity call (I1), with its common schema, release and compatibility row, and the fix to the missing `console.session` line in squadrons' row.
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
- An owner without `fleet:read` reads only their own template's page, and only the ships their read reach gives.
