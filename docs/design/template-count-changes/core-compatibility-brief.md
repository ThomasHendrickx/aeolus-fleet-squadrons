# Core compatibility brief: squadrons' template count page

A brief for its own issue in aeolus-fleet. It is not filed, and nothing in it is built or granted. It states what squadrons needs from core for [#43](https://github.com/ThomasHendrickx/aeolus-fleet-squadrons/issues/43)'s page. The squadrons-side behaviour was approved by Thomas in [api-and-identity.md](api-and-identity.md). The call names, schemas and refusals below are proposals: core's design settles them.

Existing contracts are cited from aeolus-fleet main at `2e8f61c05d16bf0be5689f10b6f5c95e30e88a00`.

## Why

Squadrons serves its own page for a template's ship count (S1). A person signs in once through pagasae (0054, H5). The page must know which person ship is signed in, checked by core (S1a), to let a template owner read and decide without `fleet:read` (R1, R2). It must also show each reader the counted ships only as far as core lets that reader see them (A3, A3b, 0017). Core stays content-blind: it learns nothing about templates, counts or decisions (0017).

## What squadrons needs

| # | Need | Exists today | What is missing |
| --- | --- | --- | --- |
| N1 | Who is signed in: the checked claims of an account token squadrons presents | Core checks an account token on every call, and a crew token beside it names the presenting ship (architecture.md, Actors). The token carries `person_ship` (0058; `accountTokenClaimsSchema`, `personShipId`). | A call that answers the checked claims. No core call returns them. |
| N2 | Read ships with the reader's own account token | Account tokens are accepted on fleet procedures, which authorise by the token's scopes and reach (architecture.md, Actors). | Squadrons' row in `docs/compatibility.md` does not list presenting an account token. |
| N3 | Read ships on behalf of a person ship | `fleet:read` reads with `fleet:on-behalf` and `Aeolus-On-Behalf-Of` answer the named ship's read reach (architecture.md, fleet procedures; 0034). 0017 says squadrons reads on behalf of a person's ship. | Squadrons' row does not list the header. |
| N4 | Read a given set of ships by id, for N2 and N3 readers, without listing the fleet | `fleet/list` has a `shipIds` filter (`fleetListFilterSchema`). A ship outside reach comes back as id, name, type and status only (`shipOutsideReadReachSchema`). Its page limit accepts 500 (`fleetListInputSchema`). | Confirming that `shipIds` works with an account token and on behalf, and with what limit. |
| N5 | A docs defect | Squadrons calls `console.session` today, and 0017 names it. | Squadrons' row does not list `console.session`. |

## N1: the claims call

**Proposed contract.** Core's design names it.
- **Caller:** a crewed ship's crew token in `Authorization`, and an account token in `Aeolus-Account-Token`.
- **Input:** none.
- **Output:**
  - `fleetId`, the token's audience;
  - `accountId`;
  - `personShipId`, or null;
  - `scopes`;
  - `endsAt`.
- **Refusals:** `UNAUTHORIZED` for a token core would refuse on any call (signature, issuer, fleet, end, cut-off), as today. The presenting ship's fleet must be the token's fleet.

**Alternatives:**
1. **A dedicated call, as above.**
2. Squadrons presents the token on an existing call and trusts its claims once accepted.
3. Squadrons checks pagasae's signature itself.

**Pick: 1**, approved as squadrons' behaviour in I1. It is the one stated, testable contract. Option 2 rests on a side effect, and option 3 makes squadrons a second token checker, which 0058 gives core.

**Data and rights:**
- It answers only claims already in the token the caller holds. It reads no ship, message or rule, and writes nothing, so it records no event.
- It needs no new scope. The caller already holds the token, and the call adds core's check, not new data.
- It tells core nothing about templates or squadrons.
- Without pagasae configured, there is no account token: it answers `UNAUTHORIZED`, and squadrons serves argo and the viewer through `console.session` only (I4).

**Open for core's design:**
- whether to limit callers to ships holding `fleet:on-behalf`, or to any crewed ship. The brief's pick is any crewed ship, since the claims are the caller's own token's;
- the call's name and its REST, tRPC and MCP exposure.

## N2 to N4: reads

**Proposed contract.** Squadrons calls `fleet/list` with `shipIds` set to the ships it counts for one template:
- **N2:** with the reader's account token beside squadrons' crew token, for a reader whose token holds `fleet:read`;
- **N3:** with `Aeolus-On-Behalf-Of` naming the reader's person ship, under squadrons' own `fleet:read` and `fleet:on-behalf`, for a template owner without `fleet:read`.

Core answers each ship within reach in full, and each ship outside reach as id, name, type and status only, as `fleet/list` does today. Squadrons shows a ship outside reach as "A ship you can't see" (A3b, approved), so it uses nothing beyond knowing the ship is outside reach.

**Alternatives for N4:**
1. **`fleet/list` with `shipIds`**, as it exists, with its limit stated.
2. One `fleet/ship` call per counted ship.
3. A new call for a set of ships.

**Pick: 1.** It exists, it is paged, and it answers outside-reach ships the way A3b needs. Option 2 costs one call per ship, and its behaviour for a ship outside reach is not stated. Option 3 adds a call for what one already does.

**Data and rights:** no new scope, rule or reach. Each read is authorised as core authorises it today, for the account (N2) or for squadrons on behalf of the person ship (N3).

## Latency and scale

- **Fleet size:** 3,000 ships and 10 million messages per fleet, as the #41 design states. No full fleet listing on a page view.
- **Squadrons' page budget:** p95 under 100 ms and p99 under 500 ms for reads, errors under 1%. Each page view makes one N1 call and one N2 or N3 read. So core's share should be:
  - **N1:** p95 under 20 ms. A local signature check against the held pagasae keys, refetched at most once a minute, as today.
  - **N2 or N3:** p95 under 50 ms for `shipIds` up to the stated limit. The limit should cover a template's counted ships: up to 200 per page is enough, with paging beyond.
- These are targets to agree in core's design and measure when built, not claims about today.

## Acceptance tests in core

- **N1, a good token:** a crewed ship presenting a valid account token gets exactly the token's account, person ship (or null), scopes and end.
- **N1, a bad token:** an ended, wrongly signed, other-fleet or cut-off token gets `UNAUTHORIZED`, naming no reason beyond today's.
- **N1, no side effects:** it reads and writes nothing else and records no event.
- **N2, account reach:** `fleet/list` with `shipIds` and an account token presented by squadrons answers by the account's scopes and reach, with outside-reach ships as id, name, type and status.
- **N3, person-ship reach:** with `Aeolus-On-Behalf-Of` and squadrons' scopes, it answers by the named person ship's read reach.
- **N4, the limit:** `shipIds` at the stated limit answers within the latency target on a 3,000-ship fleet, and past it is refused or paged as core decides.
- **Content-blind:** none of these calls takes or returns anything about templates.

## Release and minimum version

1. **Core first:** a core release carrying N1, with its schema in `@aeolus-fleet/common`, and the N2 to N4 tests.
2. **The compatibility row:** squadrons' row in `docs/compatibility.md` adds N1 to N4 with that release, and lists `console.session` (N5).
3. **Squadrons second:** the squadrons pull request that first calls N1 raises `MINIMUM_CORE_VERSION` to that release, in the same pull request (CLAUDE.md). Squadrons started against an older core exits at start, as today.
4. **Independent of core:**
   - pagasae: squadrons' page as an app of the shared sign-in (I2), and Squadrons in the app list (E2);
   - the console's link (E1).

   Squadrons' page serves persons only once core and pagasae are both in place. Until then it serves argo and the viewer through `console.session`.

## Not asked of core

- No new scope, network rule or reach.
- No template, count or decision data in core.
- No change to how core checks account tokens.
- No change to `fleet/ship`. Squadrons uses it only as itself, for whether the template owner's ship is retired (O1).
