# Squadrons: templates, blueprints and the check-in

Model and decisions: #79, #86, decision 0017. Aeolus knows nothing of what is described here; only the squadrons package and the aeolus plugin read it.

## Files in git

Ship templates and squadron blueprints are YAML files in GitHub repositories, as Dockerfiles and compose files are. squadrons reads them from the repositories it is configured with, through GitHub's REST API: it never clones a repository, keeps no files on disk, and never edits them. Other hosts get a reader when someone asks for one. To write your first ones, start at [Writing them](#writing-them).

- **Where:** in each configured repository, `templates/*.yaml` and `blueprints/*.yaml` under its folder: `.aeolus/squadrons/` unless the repository's entry in the configuration sets a `path`. One file is one template or one blueprint, and the file name (without `.yaml`) is its name, unless a blueprint sets its own with `name`.
- **Versions are git tags.** A template's version `n` is the tag `<name>@<n>` (`tester@4`), a blueprint's likewise (`hemma-feature@4`), each a whole number from 1. A tag always names the file: a blueprint `team.yaml` that sets `name: hemma-feature` is tagged `team@4`, and each version takes the name its own file sets. The tag's commit holds that version of the file. A tag of that form whose commit has no such file, or whose name is not lowercase (`Tester@4`), is reported with why; any other tag (`v1.0.0`) is no version tag and is ignored. The console shows templates as `tester@4`, blueprints as `v4`, and each version with its short commit (`4f2a91c`). A file changed without a new tag is no new version.
- **Snapshots:** forming a squadron stores the blueprint version and every template version it uses, as read then, a template on a base as built, with its chain. A squadron never changes when the files change later.

## Ship template

A reusable role, like an image: what a ship in this role does, how often it checks in, how it is launched, and the hand-offs it accepts, like the environment variables an image accepts.

An example: [tester.yaml](squadrons-example/.aeolus/squadrons/templates/tester.yaml), and its siblings in the [example set](#example-set).

| Field | Required | Rule |
| --- | --- | --- |
| `base` | no | The template it builds on; see [Template bases](#template-bases) |
| `description` | yes | One line, for the template lists |
| `checkIn` | yes | How often a member reports, late after one interval and silent after three. A duration: `<n>m` or `<n>h`, from 1 minute to 24 hours |
| `launchNote` | no | Shown once per role, above its members' crew lines: where to start the session |
| `charter` | yes | The role's instructions, given to the member at check-in, as written. At most 48 KB (UTF-8), so the role message stays within the 64 KB payload limit |
| `handoffs` | no | Hand-off names (handles) with what each carries; a blueprint binds each to a role |
| `parameters` | no | Parameter names (handles) with what each stands for, used as `{{name}}` in `charter` and `crew.firstPrompt`; see [Crew settings](#crew-settings). A placeholder the template does not declare is refused |
| `crew` | no | How its members are crewed, and the model they run (`crew.model`); see [Crew settings](#crew-settings) |
| `scopes` | no | The scopes its members get at commission, each `<namespace>:<action>`, at most 20. squadrons grants them within the subset rule: scopes its own ship holds, and its own namespace `squadrons` (decision 0017). Forming a blueprint with a template that names any other scope is refused before anything is commissioned |

With a `base`, only `description` is required: `checkIn` and `charter` come from the base unless the template sets them.

## Template bases

A template may build on one other template version, as a Dockerfile builds `FROM` one image: it names its base and states only what differs, what it adds, what it replaces and which of its base's parameters it fills (design: [template-bases.md](design/template-bases/template-bases.md)). The result is a template version like any other: a blueprint role runs it, and another template names it as its base. Every template is complete and formable, a base too.

```yaml
# templates/typescript-implementer.yaml
base:
  template: github.com/ThomasHendrickx/skills#implementer@2
  parameters:
    language: TypeScript
description: Implements a slice in a TypeScript repository
crew:
  model: claude-opus-5-5
charter: |
  Run npm run typecheck before every commit.
```

| Field | Required | Rule |
| --- | --- | --- |
| `base.template` | yes, with `base` | `<repository>#<name>@<n>`: a repository the fleet added, a template's name and a version tagged in it. Only tags, letter case exact, as a blueprint's reference |
| `base.parameters` | no | Values for parameters the base leaves open, by name, each at most 1 KB. A name the base does not leave open is refused, naming the parameters it does |
| `base.replaceCharter` | no | `true`: this template's `charter` replaces its base's whole, and is then required. Left out: the charter is added after the base's |

There is no build language: no conditionals, no loops, no instructions that run when a later template builds on this one, no second base, and no version ranges or "latest".

### Building

squadrons builds each template version when it reads the catalogue. It walks the chain from base-layer-0, the template without a base, up to the version itself, and applies each layer over the full template below it:

| Part | Rule per layer |
| --- | --- |
| `charter` | Added after the charter below, one blank line between; replaced whole with `base.replaceCharter: true` |
| `base.parameters` | Each value is filled into the charter and `crew.firstPrompt`, below and the layer's own; the parameter is then no longer the template's, and neither a blueprint nor a form sees it |
| `parameters` | The layer's own, added to those left open below. A name already a parameter below, open or filled, is refused |
| `description`, `checkIn`, `launchNote` | Set: replaces the one below. `description` is never taken from below |
| `handoffs` | Added. A name already declared below is refused |
| `scopes` | Added; one already below is kept once |
| `crew` | Each field set replaces the one below whole, `options` per key, as a blueprint role does over a template |

A placeholder in a layer's own charter or first prompt must be a parameter of the full template at that layer: one left open below, one it declares, or one it fills. The full template then holds what a template without a base holds, and every check runs on it: at most 48 KB of charter, 8 KB of first prompt and 20 scopes, the subset rule for scopes at forming, a blueprint binding exactly its hand-offs, and the form's limits.

A chain holds at most 10 templates, the template itself included; a loop is refused. Each built template keeps its chain, base-layer-0 first, each layer's repository, name, version and commit, and which layer gave each part of its charter, each field and each filled parameter.

A version that cannot be built is left out of the catalogue with why, as a version left out for its own file, and so is every blueprint naming it:

| Case | Why |
| --- | --- |
| A base in a repository the fleet has not added | "typescript-implementer@1 cannot be included: its base github.com/ThomasHendrickx/skills#implementer@2 is in github.com/ThomasHendrickx/skills, which this fleet has not added. Add it under Settings, Repositories." |
| A base's repository added but not read | The base, its repository and its last fetch's reason. A repository whose fetch fails keeps what it last read, and templates built from it stay |
| A base at no tag, or a version not tagged | The reference, as a blueprint's |
| A base left out itself | The base and its reason; a chain left out low leaves out every version above it |
| A loop | "a@2 builds on b@1, which builds on a@2" |
| Too deep | "typescript-implementer@1 builds on 11 templates; a chain holds at most 10", with the chain |
| A rule of building broken | The field: a parameter not left open, a name declared twice, an undeclared placeholder |
| A limit broken once built | The limit and the full size: a charter over 48 KB, a first prompt over 8 KB, over 20 scopes |

A squadron forms from the built templates, and its snapshot keeps each with its chain; a member at check-in gets one charter, as from any template. A new base version reaches a template only through a new version of that template naming it.

## Squadron blueprint

A compose file: which roles, how many ships each, which template version each runs, and where each hand-off goes.

An example: [tidewater-feature.yaml](squadrons-example/.aeolus/squadrons/blueprints/tidewater-feature.yaml), and [tidewater-fix.yaml](squadrons-example/.aeolus/squadrons/blueprints/tidewater-fix.yaml) with prefixed member names.

| Field | Required | Rule |
| --- | --- | --- |
| `name` | no | The blueprint's name, a handle: in the catalogue, the console, a form reference and the base of squadron ids. The file name when left out. Its tag stays `<file name>@<n>`. Blueprint files of one repository that give one name (a `name`, or a file name another sets as its `name`) are all left out, each saying which others give it. A blueprint whose name (its `name` or file name) is a template's name in its repository is left out, saying which template versions have it; the template stays |
| `description` | yes | One line |
| `roles` | yes | Role names (handles) to a template reference and a `count` (1 when left out, at most 20) |
| `roles.<role>.template` | yes | `<repository>#<name>@<n>`: a configured repository, the template's name, and its version, the tag `<name>@<n>` in that repository. Only tags: never a branch or a commit |
| `roles.<role>.crew` | no | Crew settings over its template's, its `crew.model` too; see [Crew settings](#crew-settings) |
| `roles.<role>.parameters` | no | Values for its template's parameters, by name. A parameter the template does not declare is refused |
| `handoffs` | no | `<role>.<hand-off>: <role or flagship>`. Every hand-off a template declares must be bound; a binding to a hand-off no template declares is refused |
| `memberNames` | no | `plain` (when left out) or `prefixed`; see [Names](#names) |

## Crew settings

A template and a blueprint role may each say how members are crewed (#343), in a `crew` block with the fields of a crew request's settings ([trierarch.md](https://github.com/ThomasHendrickx/aeolus-fleet-trierarch/blob/main/docs/trierarch.md#the-crew-request)). Every field is optional in both files:

| Field | Rule |
| --- | --- |
| `harness` | The harness, such as `claude-code` |
| `model` | The exact model id a member runs (`claude-opus-5-5`), never an alias: lowercase letters, digits, dots and hyphens, with at least one digit, not ending in `-latest`. A template's is shown with the launch note as its pinned model; a member that states another model at check-in is flagged, not stopped |
| `workspace` | `{ kind: worktree, repository, ref? }` or `{ kind: folder, name }`, each named in the trierarchs' configuration, never a path |
| `firstPrompt` | Given on the first start only: at most 8 KB, never starting with `-`. It may use the template's `{{name}}` parameters |
| `options` | Named settings, such as `effort`. Never `model`: `crew.model` is the one place for it |
| `machineLabels` | `key=value` names, such as `os=linux`, at most 20: names, not ids, so a file works in any fleet. The machine must carry every one |

A member's crew settings are its template's with its role's over them, nearest wins: each field the role sets replaces the template's whole, except `options`, which merge per key. The model, the role's `crew.model` or else the template's, goes into the settings as `options.model`. A `model` outside `crew`, at the top of a template or of a role, is refused, as is `crew.options.model`: each points to `crew.model`. A squadron is never named in a file: squadrons gives each member its own.

`launchNote` and `crew.firstPrompt` are separate: the launch note is shown to a person above a crew line, the first prompt is what the session gets.

Parameters let a template leave a value to the squadron, such as whom a member reports to. The template declares each under `parameters` and uses it as `{{name}}` in its charter or first prompt; a role fills it under `roles.<role>.parameters`. One no role fills is left for whoever forms the squadron, as is anything else still missing, such as the workspace.

At forming, and when a member is added, the form may set a third layer per member (`members` of `squadrons.form`, keyed `<role>-<n>`, n counting from 1 within the role; `member` of `squadrons.addMember`): crew settings over the files', nearest wins as above, and parameter values over the role's. squadrons then:

- refuses, before it commissions anything, a `members` key that names no member of the blueprint, a parameter value over 1 KB, and a member whose charter is over 48 KB or whose first prompt is over 8 KB once filled, naming that member: the template limits, so the role message stays within 64 KB (#371);
- keeps each member's parameter values; its flagship fills the charter's `{{name}}` with them in the role message, and squadrons fills the first prompt's. A placeholder without a value stays as written;
- looks up every machine label of the members it will request crew for as the fleet's value id before it commissions anything. A label the fleet does not define forms nothing: "The fleet has no machine label os=macos, so nothing was formed";
- writes one crew request per member whose settings name a workspace, with the squadron id as `squadron`. A member without a workspace gets none and keeps its crew lines. A request the fleet refuses fails forming as any refused step does: every ship it commissioned is retired.

Forming in the console, with the trierarch plugin connected, shows each member with its settings merged from its files, and the operator changes any of them: the form is the third layer, nearest wins. Each member needs a workspace, picked from the repositories and folders the machines report, and every parameter left empty; Workspace for every member fills the workspaces still missing at once, and Form squadron is on once every member has what it needs. A machine label the fleet does not have is shown as a warning: forming refuses it, and nothing is formed. Without the trierarch plugin, members are crewed by hand with their crew lines.

## Writing them

### Example set

[docs/squadrons-example](squadrons-example) is a complete set for an invented project, Tidewater: four templates (planner, implementer, reviewer, tester) and two blueprints (`tidewater-feature`, `tidewater-fix`) in a repository named `github.com/tidewater-labs/squadron-templates`. They show crew settings: `tidewater-fix` runs its implementer on Codex with another model, over the template's Claude Code, and the planner's `area` parameter is left for the form. Each file is version 1, as its tag `<name>@1` would make it. A test reads the set through squadrons' own reader and leaves nothing out, so it stays valid.

### Step by step

1. Write the template in `.aeolus/squadrons/templates/<name>.yaml`, with the fields of [Ship template](#ship-template). The name is a handle: lowercase letters, digits, hyphens or colons.
2. Commit it, tag that commit `<name>@1`, and push the tag: `git tag tester@1 && git push origin tester@1`. The next version is a new commit tagged `tester@2`; never move a tag.
3. Write the blueprint in `.aeolus/squadrons/blueprints/<name>.yaml`, with the fields of [Squadron blueprint](#squadron-blueprint); set `name` when it should go by another name than its file's. Each role names its template as `<repository>#<template>@<n>`, where the repository is the name squadrons gives it under [Template repositories](#template-repositories) and `<n>` a version tagged in step 2. Bind every hand-off the templates declare.
4. Commit it, tag that commit `<file name>@1` and push the tag. The blueprint's tag and its templates' tags may point at different commits: each file is read at its own tag.
5. In the console, Settings, Repositories: add the repository, or Refresh when it is added already. squadrons never fetches on a timer. The repository's row shows what was found, and each file or tag left out with why.

### Common mistakes

- **A change without a tag.** Editing a file on main changes nothing: only a new tag is a new version.
- **A tag that does not match the file.** The tag `tester@1` reads `templates/tester.yaml` and `blueprints/tester.yaml` at its commit, nothing else. `Tester@1`, `tester-1`, `tester@v1` and `tester@1.0` are no versions, and a file named `Tester.yaml` or `tester.yml` is not read.
- **Letter case in a reference.** A reference's repository must be the repository's name exactly, letter case too: a repository added as `https://github.com/Tidewater-Labs/squadron-templates` is named `github.com/Tidewater-Labs/squadron-templates`, and a reference to `github.com/tidewater-labs/squadron-templates` does not find it.
- **A reference to a version that is not tagged**, or to a branch or a commit: a role's template is always `<name>@<n>`, a tag that exists.
- **A hand-off left unbound**, or bound to a role the blueprint does not have. A blueprint binds exactly the hand-offs its templates declare, each to one of its roles or to `flagship`.
- **A model outside `crew.model`.** The model goes in `crew.model`, of the template or the role, never in a top-level `model`, `roles.<role>.model` or `crew.options.model`.
- **A machine label as an id or a key alone.** A file writes `os=linux`, never `lbv_...` or `linux`.
- **A duration or model in another form.** `checkIn` is `30m` or `2h`, not `30 min`, `90s` or `2d`. `crew.model` is an exact id such as `claude-opus-5-5`, never `opus` or `claude-opus-latest`.
- **Two blueprints of one name.** Two blueprint files of one repository that give one name, through `name` or their file name, are both left out: give each its own name.
- **A template and a blueprint of one name.** One tag reads both folders, so `tester@1` would be both a template and a blueprint version, and a blueprint's `name` may take a template's name too. Such a blueprint is left out, saying which template versions have the name; the template stays, so the blueprints that use it keep working. Give the blueprint another name.

## Names

No squadron prefix by default: membership is known by squadrons and shown with SquadronTag, not carried in names.

- **Squadron id:** the blueprint's name plus six random lowercase alphanumerics, `hemma-feature-a1b2c3`, unless the operator gives one when forming. It is a ship handle, so it can name ships.
- **Flagship:** named as the squadron id (`hemma-feature-a1b2c3`), type `flagship`. "Message the squadron" means messaging this ship, and a member finds its flagship from the squadron id in its crew line. The squadron page offers Message, to the flagship, until the squadron is Disbanded (Forming, Sailing and Standing down), to a session that may send: Aeolus blocks no message. A member's menu on that page offers no Release: Get new crew line is how a member gets a new session. While the squadron is Standing down, and once it is Disbanded, the page says what that state means, with no time: the squadrons API records none for either. The page of a ship in a squadron, its flagship or a member, sits below it: the breadcrumb reads Squadrons, the squadron, the ship, and each level above links up to it.
- **Members:** `<role>-<four random lowercase alphanumerics>`, `implementer-k3x9`, so two squadrons formed from one blueprint never ask for the same name. A blueprint may choose prefixed names with `memberNames: prefixed`, which gives `<squadron id>:<role>-<n>` (`hemma-feature-a1b2c3:implementer-1`).
- **Member types:** every member of one role in one squadron has the ship type `<squadron id>:<role>` (`hemma-feature-a1b2c3:implementer`). A hand-off to a role is a message to any ship of that type, so the first free member of the role takes it, and no other squadron's ship ever does. The type carries the membership; names carry none. The squadron label carries reach only (see Labels and reach).
- **The flagship has no template:** squadrons crews it itself.
- **What squadrons' ships state:** `aeolus-squadrons` as their harness. Each flagship is an agent ship and states `@aeolus-fleet/squadrons@<version>`, the version it runs, as its model on every send (decision 0018); the management ship is a plugin ship and states none, as the fleet refuses a model from a plugin ship.

## Crew lines

squadrons hands each member its crew lines once, when it forms the squadron, adds the member, or gives it a new crew line, and stores them nowhere:

- **One per harness with the aeolus plugin** (Claude Code, Codex): the fleet's crew line with the squadron id appended. The plugin registers and checks in.
- **One for a chat client** (Claude chat, ChatGPT), which has no plugin: the fleet's crew instructions for a chat (its starting prompt; [connect a ChatGPT chat](https://github.com/ThomasHendrickx/aeolus-fleet/blob/main/docs/guides/chatgpt.md)), then the check-in below in full, with the member's role. The console's switch calls it Chat.

The console shows a role's launch note and pinned model once, and each member one row: a switch between Claude Code, Codex and Chat (Claude Code first), the chosen line, and one copy button.

## Check-in

A ship crewed with a squadron id checks in at its flagship before it does anything else, and again after /clear, compact and resume. These messages travel like any other; the content types are reserved by convention between squadrons and the plugin, not by Aeolus.

1. The member sends `application/vnd.aeolus.squadron.check-in+json` to its flagship: `{ "squadron": "<id>", "model": "<the exact model id it runs>" }`. Its ship id is the sender. squadrons keeps the model it states; when its template pins a model (its `crew.model`) and the member states another, or none, the member shows a model mismatch. Nothing is refused for it.
2. The flagship answers it (`inReplyTo` set) with `application/vnd.aeolus.squadron.role+json`: `{ "squadron", "role", "template": "tester@4", "charter", "checkIn": "30m", "handoffs": { "on-fail": { "kind": "type", "type": "hemma-feature-a1b2c3:implementer" }, "on-pass": { "kind": "ship", "name": "hemma-feature-a1b2c3" } }, "flagship" }`. Each hand-off is the selector to send to: the role's type, or the flagship by name. While the squadron stands down, the role message also holds `"standingDown": true`; what the member does then is in [Stand down](../packages/squadrons/README.md#stand-down).
3. The member answers that (`inReplyTo` set) with `application/vnd.aeolus.squadron.on-station+json`: `{ "squadron", "role" }`. From then on it is on station; a Forming squadron sails when every member is.

The other two messages of this convention, `application/vnd.aeolus.squadron.stand-down+json` from the flagship and `application/vnd.aeolus.squadron.stood-down+json` from the member, are described once, in [Stand down](../packages/squadrons/README.md#stand-down).

A ship's Messages tab in the console says each of these five in words, by its content type: "Checked in at its flagship", "Given the role: reviewer", "Took up the role: reviewer", "Asked to stand down", "Stood down". The message sheet keeps the payload, formatted and raw. Any other JSON payload shows there as its top-level fields in one compact line. The server knows none of these types.

## Forming by a ship

A ship holding `squadrons:form` forms a squadron by message, and stands it down (decision 0017). That ship is the squadron's forming ship: the sender as the fleet names it, never a name in a payload. A squadron argo forms in the console has argo as its forming ship. These messages travel like any other; the content types are reserved by convention between squadrons and the ships it serves, not by Aeolus.

1. The forming ship sends squadrons' own ship (`squadrons`) `application/vnd.aeolus.squadron.form+json`: `{ "blueprint": "<repository>#<name>@<n>", "squadronId"?, "members"?: { "<role>-<n>": { "parameters": { ... } } }, "key": "<new per form>" }`.
2. squadrons reads the sender's scopes from the fleet (`fleet.ship`). It answers, `inReplyTo` the request, with `application/vnd.aeolus.squadron.formed+json`: `{ "key", "squadronId", "flagship" }`, or `application/vnd.aeolus.squadron.form-refused+json`: `{ "key", "code", "message" }`. It refuses a sender without `squadrons:form` (`NEEDS_SCOPE`), a request that is no such JSON (`INVALID_FORM_REQUEST`), and whatever forming refuses, before anything is commissioned. A ship's members are crewed by crew requests only: no crew line, which holds a secret, travels in a message, so a role whose crew settings name no workspace is refused. squadrons keeps its first answer per forming ship and key: a request that repeats a key gets it again and forms nothing.
   The flagship and every member get the forming ship's owner: squadrons names the forming ship on each commission (`ownerOf`), which takes `fleet:on-behalf` (decision 0045). squadrons declares no reach rule for it: an `owner=#` to `owner=#` rule in force lets the flagship and its forming ship reach each other.
3. A member never sends to the forming ship. It sends its flagship `application/vnd.aeolus.squadron.relay+json`: `{ "squadron", "payload" }`. The flagship sends the forming ship the same content type: `{ "squadron", "member": { "name", "role" }, "messageId", "payload" }`, where `messageId` is the member's message. A payload that does not fit 64 KB with that envelope is refused to the member with `application/vnd.aeolus.squadron.refused+json`: `{ "squadron", "code", "message" }`, asking for a reference.
4. The forming ship answers a relay with a relay of its own, `inReplyTo` the relay it answers: `{ "squadron", "payload" }`. The flagship sends it to the member, `inReplyTo` the member's message, as `{ "squadron", "from", "payload" }`. The forming ship may also send its flagship a relay naming a member or a role, `{ "squadron", "to": { "member": "<name>" } | { "role": "<role>" }, "payload" }`: the flagship sends it on to that member, or to one ship of the role (a message to the role's type).
5. The forming ship stands its squadron down by sending the flagship `application/vnd.aeolus.squadron.stand-down+json`: `{ "squadron" }`. The flagship refuses any ship but the forming ship and argo, a forming ship that no longer holds `squadrons:form`, and a squadron that is not Sailing. It answers `application/vnd.aeolus.squadron.standing-down+json`: `{ "squadron" }`, then stands the squadron down as [Stand down](../packages/squadrons/README.md#stand-down) says.
6. What a flagship tells argo of its squadron, a message it keeps, goes to the forming ship instead. For a squadron argo formed nothing changes.
7. The forming ship holding `squadrons:scale`, or argo, adds and removes members of a Sailing squadron by message to the flagship; any other ship is refused (`NOT_FORMING_SHIP`), and the forming ship without the scope too (`NEEDS_SCOPE`).
   - Add: `application/vnd.aeolus.squadron.add-member+json`: `{ "squadron", "role", "parameters"?, "key": "<new per add>" }`. The role must be crewed by request, as at forming. The flagship answers `application/vnd.aeolus.squadron.member-added+json`: `{ "squadron", "key", "member": { "name", "role" } }`. A request that repeats a key from the same sender gets the member it added again (a key is its sender's own); a refused one is tried again. The member gets the forming ship's owner, as at forming.
   - Remove: `application/vnd.aeolus.squadron.remove-member+json`: `{ "squadron", "member": "<ship name>" }`, removed as the console removes one. The flagship answers `application/vnd.aeolus.squadron.member-removed+json`: `{ "squadron", "member" }`, also for a member removed already. A name the squadron does not have is refused (`NO_SUCH_MEMBER`).
   - Any other refusal answers `application/vnd.aeolus.squadron.refused+json` with the use case's own code, as the console names it (`NOT_SAILING`, `ROLE_NOT_FOUND`, `LIMIT_REACHED`, `ADDING_FAILED`, `SQUADRON_NOT_SERVING`).
8. Once the forming ship is retired, its owner takes its place in full (0.R): relays and kept-message notices go to the owner, and the owner stands the squadron down, adds and removes members, under the same scopes. squadrons reads whether the forming ship is retired, and its owner, from the fleet at each step, so an owner argo changes counts at once; argo takes the place when the fleet names no owner or the owner is retired too.

### Limits

squadrons' configuration bounds forming (question 9): `SQUADRONS_PER_FLEET` (squadrons not disbanded in a fleet), `SQUADRONS_PER_FORMING_SHIP` (squadrons not disbanded that one ship formed; argo is the forming ship of what it forms in the console) and `MEMBERS_PER_SQUADRON` (members not retired nor being released, checked at forming and at each add). Each is none while unset. They bind every form and add, argo's in the console too. One over a limit is refused with `LIMIT_REACHED`, naming the limit, before anything is commissioned.

## Lifecycle

The lifecycle of a squadron and its members (states, transitions, stand down, force stand down, adding and removing members, a new crew line, health, and what squadrons does not handle) is described once, in [the squadrons package README](../packages/squadrons/README.md#lifecycle).

## Connection

One squadrons install serves every fleet at its `FLEET_URL`, with one connection per fleet (decision 0021): each fleet's operator connects it for their own fleet, and works on that fleet only. squadrons starts not connected to a fleet: no management ship and no secret in its environment or files. The operator connects it in the console, Settings, Connect squadrons (argo only): the web app's server commissions the management ship, named `squadrons` of type `squadrons` with `fleet:read`, `fleet:commission`, `fleet:manage`, `labels:define`, `labels:assign`, `fleet:on-behalf` and `scopes:declare`, and hands its secret to squadrons, server to server. squadrons registers with it as a server, checks that the ship is of the operator's fleet and holds `fleet:read`, `fleet:commission` and `fleet:manage` (otherwise it lets the ship go and keeps nothing), and keeps only the crew token. The secret is never shown or stored.

- **Not connected:** that fleet's forming and flagships wait, and the squadrons API answers its operator that squadrons is not connected.
- **Connected:** squadrons crews each fleet's ship again with its kept crew token after a restart.
- **Its namespace:** on every rescan, while its ship does not hold it, squadrons declares the namespace `squadrons` with `squadrons:form` and `squadrons:scale` (decisions 0017 and 0046), which it enforces itself. While another ship holds the namespace it declares nothing and argo is told once.
- **Released:** when the operator releases the management ship, squadrons drops that fleet's crew token and is not connected to it; other fleets stay connected. Connect squadrons, the same button, releases the ship if a session still holds it, gives it a new starting prompt and connects again.

## Labels and reach

squadrons keeps each squadron's reach in place itself (#573, decisions 0031 and 0037), so argo writes no rule per squadron. On every rescan of a fleet it serves (every interval, and after forming and standing down) it:

- **defines and assigns two labels it owns:** `squadron`, with one value per squadron that is not disbanded, its id; and `squadron-role`, with `flagship` and `squadrons`. Each such squadron's flagship carries `squadron=<id>` and `squadron-role=flagship`, each member that serves `squadron=<id>`, and its management ship `squadron-role=squadrons`. A value no ship carries any more and no squadron needs is removed. A key another ship owns is left alone;
- **declares three rules** with `fleet.declareNetworkRules`: `squadron=#` to `squadron=#` (every ship reaches the ships of its own squadron), `squadron-role=flagship` to `squadron-role=squadrons` and the reverse (the flagships and its management ship reach each other). No flagship reaches another. Declared once per process while its labels stay the same; they are in force beside the fleet's own rules (decision 0037);
- **at the limit:** a label holds at most 50 values (decision 0031), so a squadron beyond them carries no squadron label and argo is told once: once rules are in force its ships do not reach each other by these rules. A value frees once a disbanded squadron's ships are retired;
- **without the label scopes** (a management ship commissioned before them; scopes never change) it labels and declares nothing, and argo is told once: retire the management ship and connect squadrons again.

Switching squadrons off for a fleet withdraws its declared rules at once (an empty list); if the fleet does not answer, the switch is kept and a later rescan withdraws them. The labels it assigned stay.

A fleet's rescans run one at a time (#626): one asked while another runs waits for it, and those asked meanwhile share one rescan after it. Switching off and deleting a fleet wait for the rescan in flight too, so that rescan cannot declare the rules again after they are withdrawn; a delete holds the fleet until it is forgotten, so no rescan declares in between.

## Switched per fleet

A hosting service can switch squadrons on or off per fleet (decision 0021). With no installation token configured the installation is open: every fleet is served, and nothing below applies.

- **Off until switched on:** with an installation token, a fleet is off until the hosting service switches it on.
- **Off:** squadrons does nothing for the fleet. Its console shows nothing of squadrons; the squadrons API answers only `connection.status` (with `enabled: false`) and refuses the rest, Connect included; its flagships stop receiving and its stand-downs wait. Everything is kept: on again, it resumes as it was.
- **Delete:** squadrons withdraws its declared network rules from the fleet, then forgets everything it holds of the fleet: its repositories and their tokens, its catalogue, its squadrons and what their flagships kept, its formation attempts, its connection and its switch. While the fleet does not answer, the delete is refused (502) and forgets nothing, for the hosting service to retry. Its ships and the labels it assigned stay there.

## Template repositories

The repositories squadrons reads are runtime configuration: the operator adds them in the console, under Settings, never in a file. Each has:

- **URL:** the repository's https URL on github.com, such as `https://github.com/thomashendrickx/squadron-templates.git`; any other URL is refused. Its name, what blueprints reference, is the URL without the scheme and `.git`: `github.com/thomashendrickx/squadron-templates`.
- **Path:** the folder holding `templates/` and `blueprints/`; `.aeolus/squadrons` when left out.
- **Token:** a read token for a private repository, entered once and never shown again. squadrons reads a repository with its own token only, and with no token unauthenticated: a private repository without a token that can read it is not read, whatever credentials the host holds.

squadrons fetches a repository when the operator adds it, every repository when the operator refreshes, and every repository once when it connects or starts, since it keeps nothing across a restart; never on a timer. A fetch asks GitHub for the repository's tags, naming the ETag of its last answer: an unchanged repository answers 304, which GitHub does not count against its rate limit, and nothing more is read. A commit's content never changes, so what is read at one is kept by repository and commit, for every fleet of the install: a new commit costs one tree and one commit call, and one read for each file of a tag `<name>@<n>` that exists there. Each fleet still asks for the tags itself, with its own token, before it is given anything kept. A fetch that fails keeps the repository, with why, and keeps what it last read. Settings shows for each repository the template and blueprint versions found, and every version and version tag left out with its reason: invalid YAML, a missing or wrong field (which, and what it expects), a reference to a repository squadrons does not know (or knows under another letter case: names match exactly), to a template at no tag or a version not tagged, an unbound or unknown hand-off, a tag with no file of its name. A repository read whole shows nothing left out. Removing a repository takes its versions out of the catalogue at once; formed squadrons keep the versions they formed from.

## Architecture

`@aeolus-fleet/squadrons` forms squadrons of ships from blueprints and leads them (decision [0017](decisions/0017-squadrons-package.md)): its own core, ports and Prisma adapter, its own database and migrations, the fleet's public REST API as its management ship (`fleet:read`, `fleet:commission`, `fleet:manage`, `labels:define`, `labels:assign`, `fleet:on-behalf`, `scopes:declare`), and GitHub's REST API for the template repositories, with no clone and no files on disk. `src/core` holds domain, use cases and ports, and `src/adapters` the rest, as in the fleet core; squadrons reaches the fleet only through the fleet's public API, never its tables. It depends on `common` only. The calls it makes and the minimum core version it checks: aeolus-fleet's [docs/compatibility.md](https://github.com/ThomasHendrickx/aeolus-fleet/blob/main/docs/compatibility.md).

## Deployment

A long-running Node process with its own Postgres database (it may share the fleet's Postgres server), serving every fleet of the server with one connection each, switched per fleet by a hosting service with squadrons' own installation token (decision [0021](https://github.com/ThomasHendrickx/aeolus-fleet/blob/main/docs/decisions/0021-squadrons-installation.md)), and no files of its own: it reads template repositories from `api.github.com`, on any VM or container host next to the server. It needs no public address: only the web app's server and the fleet's API talk to it or it to them, and it calls out to GitHub.
