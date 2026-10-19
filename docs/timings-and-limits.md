# Timings and limits

Every fixed timing and limit of squadrons, for debugging. This page holds no rules of its own: each line points to the constant that sets it and the decision, issue or doc that says why. When a value here and its source disagree, the source wins; fix this page. The limits every package shares, from `@aeolus-fleet/common`, are in aeolus-fleet's [timings and limits](https://github.com/ThomasHendrickx/aeolus-fleet/blob/main/docs/timings-and-limits.md).

A default that configuration may change names its setting.

| Value | What it guards | Set in | Behind |
| --- | --- | --- | --- |
| 30 s | The flagships' rescan: new receives, stand-downs, recovery, labels and rules | [bin/aeolus-squadrons.ts](../packages/squadrons/src/bin/aeolus-squadrons.ts) `FLAGSHIP_RESCAN_MS` | [squadrons README](../packages/squadrons/README.md), ThomasHendrickx/aeolus-fleet#573, ThomasHendrickx/aeolus-fleet#626, ThomasHendrickx/aeolus-fleet#738 |
| 1 s | A flagship's wait before receiving again after a failed receive | [flagships/flagship-watch.ts](../packages/squadrons/src/adapters/flagships/flagship-watch.ts) `RETRY_MS` | none recorded |
| 10 | Deliveries per flagship receive | [fleet/rest-fleet-door.ts](../packages/squadrons/src/adapters/fleet/rest-fleet-door.ts) (inline `max: 10`) | [architecture.md](https://github.com/ThomasHendrickx/aeolus-fleet/blob/main/docs/architecture.md) |
| made once | A retire is never made again while the fleet is busy | [fleet/rest-fleet-door.ts](../packages/squadrons/src/adapters/fleet/rest-fleet-door.ts) `isBulk` | [architecture.md](https://github.com/ThomasHendrickx/aeolus-fleet/blob/main/docs/architecture.md), ThomasHendrickx/aeolus-fleet#734 |
| 2 calls | A commission asked again under the same idempotency key when no answer came | [squadron/formation.ts](../packages/squadrons/src/core/squadron/formation.ts) (inline) | none recorded |
| 5 names | Random names tried per ship before commissioning gives up on a name conflict | [squadron/formation.ts](../packages/squadrons/src/core/squadron/formation.ts) `NAME_ATTEMPTS` | none recorded |
| 5 passes | Recovery passes with a refused retire before retiring stops and argo is told once | [squadron/recover-formations.ts](../packages/squadrons/src/core/squadron/recover-formations.ts) `RECOVERY_REFUSAL_LIMIT` | ThomasHendrickx/aeolus-fleet#736, ThomasHendrickx/aeolus-fleet#738, ThomasHendrickx/aeolus-fleet#740 |
| late after 1 interval, silent after 3 | A member that misses its check-in | [squadron/member-health.ts](../packages/squadrons/src/core/squadron/member-health.ts) `SILENT_AFTER_INTERVALS` (late inline) | [squadrons.md](squadrons.md), ThomasHendrickx/aeolus-fleet#86 |
| 1 minute to 24 hours | A template's check-in interval | [catalogue/assemble-catalogue.ts](../packages/squadrons/src/core/catalogue/assemble-catalogue.ts) `CHECK_IN_MAX_MINUTES` | [squadrons.md](squadrons.md) |
| 1 to 20, default 1 | Ships per blueprint role | [catalogue/assemble-catalogue.ts](../packages/squadrons/src/core/catalogue/assemble-catalogue.ts) `COUNT_MAX` | [squadrons.md](squadrons.md) |
| 48 KB | A template's charter, also after its parameters are filled | [catalogue/catalogue.ts](../packages/squadrons/src/core/catalogue/catalogue.ts) `CHARTER_MAX_BYTES` | [0006](https://github.com/ThomasHendrickx/aeolus-fleet/blob/main/docs/decisions/0006-payload-limit.md), [squadrons.md](squadrons.md), ThomasHendrickx/aeolus-fleet#371 |
| 1 KB | One parameter value from the form | [squadron/member-crew-request.ts](../packages/squadrons/src/core/squadron/member-crew-request.ts) `PARAMETER_VALUE_MAX_BYTES` | [squadrons.md](squadrons.md), ThomasHendrickx/aeolus-fleet#371 |
| 50 squadrons | Squadrons that carry the `squadron` label (its 50 values) | `LABEL_VALUES_MAX` in common, used in [network/label-squadrons.ts](../packages/squadrons/src/core/network/label-squadrons.ts) | [0031](https://github.com/ThomasHendrickx/aeolus-fleet/blob/main/docs/decisions/0031-labels.md), [squadrons.md](squadrons.md), ThomasHendrickx/aeolus-fleet#573 |
| 30 s | One GitHub API request | [github/github-repository-reader.ts](../packages/squadrons/src/adapters/github/github-repository-reader.ts) `DEFAULT_TIMEOUT_MS` | none recorded |
| 100 per page | GitHub tags fetched per page | [github/github-repository-reader.ts](../packages/squadrons/src/adapters/github/github-repository-reader.ts) `TAGS_PER_PAGE` | none recorded |
| 300 characters | A failed fetch's stored message | [github/github-repository-reader.ts](../packages/squadrons/src/adapters/github/github-repository-reader.ts) `FETCH_ERROR_MAX_LENGTH` | none recorded |
| 1 to 1024 characters | A template repository's read token | [catalogue/template-repository.ts](../packages/squadrons/src/core/catalogue/template-repository.ts) `TOKEN_MAX_LENGTH` | ThomasHendrickx/aeolus-fleet#161 |
| 10 s (Prisma's), tried again without end | Prisma Migrate's advisory lock at start | [prisma/migrate.ts](../packages/squadrons/src/adapters/prisma/migrate.ts) `LOCK_TIMED_OUT` | none recorded |
| at least 32 characters | `INSTALLATION_TOKEN`, when set | [config.ts](../packages/squadrons/src/config.ts) `INSTALLATION_TOKEN_MIN_LENGTH` | [0021](https://github.com/ThomasHendrickx/aeolus-fleet/blob/main/docs/decisions/0021-squadrons-installation.md) |
| none unless set | Squadrons per fleet, squadrons per forming ship, members per squadron | `SQUADRONS_PER_FLEET`, `SQUADRONS_PER_FORMING_SHIP`, `MEMBERS_PER_SQUADRON` in [config.ts](../packages/squadrons/src/config.ts) | [squadrons.md](squadrons.md#limits) |
