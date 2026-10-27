# Template bases: stage 1, purpose, lessons, questions

Issue: [aeolus-fleet#1311](https://github.com/ThomasHendrickx/aeolus-fleet/issues/1311). Stage 1 only: no detailed decisions until Thomas agrees the purpose and answers the questions.

## Purpose

Thomas, 26 Oct 2026: "it would be nice if we can make ship templates like Docker images are made. So you take a base image and then you apply some modifications on it, and that creates in itself again another image which can be then used in another template by a base as a base image. [...] some additions to it, some replacements, some filling in of parameters, whatever. [...] We could really elevate on the philosophy of how Docker images are made, and still keep it simple." And on 27 Oct: "Ok let's design the ship templates in the image of [Docker] images."

**The problem.** Today a ship template is one whole file ([Ship template](../../squadrons.md#ship-template)). Every template that shares behaviour with another (how a ship reports to its lead, how it asks the owner, how it commits) carries its own copy of that text. A fix to the shared part is copied by hand into each template, and the copies drift: the same problem Thomas solved for skills by making them installable, and for templates by sharing them from ThomasHendrickx/skills.

**What it is for.** Thomas, and anyone writing templates for a fleet, writes a shared part once, as a template, and a more specific template names it as its base and states only what differs: what it adds, what it replaces and which parameters it fills. Thomas's example: an Aeolus base ship template, an implementer template on it, a TypeScript implementer on that; reviewers likewise.

**A good outcome.**

- A template names one base template version and adds to it, replaces parts of it, or fills its parameters. The result is a template version like any other: a blueprint role runs it, and another template can name it as its base.
- A squadron still forms from one complete template per role and never changes afterwards, as now ([Files in git](../../squadrons.md#files-in-git), Snapshots).
- A person reading a template, or a squadron in the console, can see what the role's ships finally get and which template version each part came from.
- Nothing changes for a template without a base, nor for a blueprint, nor for a member at check-in: the role message carries one charter, as now.

**What it must not become.** Thomas asked to keep it simple. So no build language: no conditionals, no loops, no instructions that run when a later template builds on this one (Docker's `ONBUILD`), no template with two bases, no `{{name}}` syntax beyond what parameters already are, and no version ranges or "latest". The fleet and core learn nothing of it: it lives in squadrons alone (decision 0017), and it needs no newer core.

## Lessons to check against

### Docker

| Docker | How it works | Fit for ship templates |
| --- | --- | --- |
| `FROM image:tag` | A Dockerfile names one base image; everything after it builds on that. One base per stage. | Good: a template names one base template version. |
| The result is an image | A built image is itself a base for the next `FROM`. Any image runs, a base or not. | Good: a template with a base is a template version like any other. See question 8 for whether a template may be a base only. |
| Layers | Each instruction adds a layer over the ones below; a file deleted in a later layer still sits in the one below, so nothing is truly removed. | Partly: a template is text and fields, not files, so it can replace a part outright. What it may remove (a hand-off, a scope) is question 3. |
| `ENV`, `LABEL` | Per key, the later value wins; the rest of the base's keys stay. | Good: matches crew settings today, nearest wins per field, `options` per key ([Crew settings](../../squadrons.md#crew-settings)). |
| `CMD`, `ENTRYPOINT` | The last one wins whole; there is no "add to the base's command". | The charter is the closest thing: whole replacement alone loses the point of a shared base. Question 1. |
| `ARG` | A build value, given at build time; an `ARG` of the base is gone once the base is built, and a child declares its own to use one. | Good: a template filling its base's parameters bakes the value in, as a build value does. What stays open is question 2. |
| `ONBUILD` | Instructions a base sets to run when a child builds on it. Widely found confusing; Docker's docs warn against surprises. | Bad: left out. |
| Tags and digests | A tag (`node:20`) can be moved to another image; a digest (`@sha256:...`) never changes. Reproducible builds pin by digest. | Good: a version is the tag `<name>@<n>`, which is never moved ([Step by step](../../squadrons.md#step-by-step), step 2), and squadrons records each version's commit, its digest. |
| A new base does not reach children | A child image keeps the base it was built on until it is built again; tools such as Renovate open pull requests to bump `FROM`. | Good with a price: a squadron never changes, but a fix in a base reaches a child only through a new child version. Question 4. |
| `docker history`, `docker inspect` | `inspect` shows the final configuration, `history` each layer and the instruction that made it. | Good: the console shows the resolved template, and the chain of bases it came from. Question 6. |
| Layer limit | An image holds at most 127 layers. | A limit on how deep a chain may go. Question 5. |
| Multi-stage builds, `COPY --from` | Take parts from several images into one. | Bad: two bases is what Thomas's "keep it simple" rules out. |

### This codebase

- **Versions are exact tags.** A blueprint names a template as `<repository>#<name>@<n>`, a tag that exists, never a branch or a commit; letter case must match the repository's name ([Squadron blueprint](../../squadrons.md#squadron-blueprint), [Common mistakes](../../squadrons.md#common-mistakes)). A base reference can take the same form.
- **The snapshot.** Forming stores the blueprint version and every template version it uses, as read then, in the squadron's `templates` (`packages/squadrons/src/adapters/prisma/schema.prisma`, `Squadron.templates`). Adding a member later reads the squadron's own snapshot, not the catalogue (`packages/squadrons/src/core/squadron/add-member.ts`). Older snapshots without newer fields are read with defaults (`squadron-repository.ts`), so a new field must keep old snapshots readable.
- **The catalogue knows every version.** squadrons reads every tag `<name>@<n>` of every configured repository and keeps what it read per commit ([Template repositories](../../squadrons.md#template-repositories)). A base is then already in the catalogue when it is in a configured repository: resolving needs no more GitHub calls. A version that cannot be read is left out with why, and that is where a missing or wrong base would show.
- **Parameters.** A template declares each parameter and uses it as `{{name}}` in its charter and first prompt; an undeclared placeholder is refused. A blueprint role fills them, then the form per member, nearest wins; one left unfilled stays as written. Each value is at most 1 KB, and a charter at most 48 KB, a first prompt at most 8 KB once filled, so the role message stays within 64 KB (#371). A chain grows the charter: the 48 KB limit holds for the resolved one.
- **Crew settings.** Template, then blueprint role, then form: each field the nearer one sets replaces the farther's whole, except `options`, which merge per key; the model only in `crew.model`. A base adds one more layer below the template.
- **Scopes and hand-offs.** A template's scopes are granted within the subset rule, and forming refuses any other before commissioning anything (decision 0017). A blueprint binds exactly the hand-offs its templates declare.
- **One tag reads both folders.** The tag `<name>@<n>` reads `templates/<name>.yaml` and `blueprints/<name>.yaml` at its commit; a template and a blueprint of one name collide. Base templates follow the same naming.
- **Shared templates.** ThomasHendrickx/skills holds shared templates in `squadrons/templates/`, configured with `path: squadrons`, tagged `designer@1` beside the skills' own `v3.x` tags, which squadrons ignores (ThomasHendrickx/skills#23). An Aeolus base ship template would live there too.
- **The designer template.** [designer.yaml](https://github.com/ThomasHendrickx/skills/blob/main/squadrons/templates/designer.yaml) is the clearest case of shared text: about half its charter (report to the lead over the fleet, never ask in the terminal, invent no vocabulary, say each thing once) applies to any ship, not only to a designer.

## Questions for Thomas

### 1. How a template's charter builds on its base's

Context: the charter is the role's instructions, most of a template. Docker's `CMD` is replaced whole; replacing whole here means the shared text is copied again, which is the problem. Parameters already give a base named slots a child fills, as `ARG` does.

1. **Replace only.** A child's charter replaces its base's whole. Simplest, but shares no charter text.
2. **Add only.** A child's charter is added after its base's. Shares text; a child cannot take a sentence back.
3. **Add by default, replace whole when it says so.** A child's charter is added after its base's; a child may instead replace the base's charter whole, stated in the file. A part a child should change is a parameter of the base, which the child fills.
4. **Named sections.** A base's charter is split into named sections; a child adds a section, or replaces one by name. Most flexible, and a new structure every template author has to learn.

Pick: 3. The shared text is written once, the part a child changes is a parameter (a mechanism that exists), and whole replacement covers the rare child that must not inherit the text. Option 4 is the build language Thomas asked to avoid.

### 2. How parameters and crew settings merge along the chain

Context: today parameters are filled by a blueprint role, then the form; crew settings merge template, role, form, nearest wins, `options` per key. A base adds a layer below. Docker's `ARG` is baked in once built.

1. **A parameter a template fills is final.** A child that fills its base's parameter bakes the value in: it is no longer a parameter of the child, and neither a blueprint nor a form sees it. A parameter the child leaves open stays open for the blueprint and the form, and the child may declare its own. Crew settings merge as today, with the base below the template: base, template, role, form, nearest wins, `options` per key.
2. **Every filled value is a default.** A filled value can be filled again by any nearer layer (a child, a role, a form). Crew settings as in 1.
3. **As 1, but crew settings deep merge.** Lists such as `machineLabels` are joined rather than replaced.

Pick: 1. What a template version fills is part of what that version means (a TypeScript implementer that a blueprint can turn into a Go one is no TypeScript implementer), and a value meant to stay open stays a parameter. Crew settings keep the one rule they have.

### 3. What a child may change of its base's other fields

Context: besides the charter, parameters and crew, a template has `description`, `checkIn`, `launchNote`, `handoffs` and `scopes`. In Docker nothing below is truly removed.

1. **Single values replace, lists add.** `description`, `checkIn` and `launchNote` the child sets replace its base's; `handoffs` and `scopes` it names are added to its base's, and none is removed.
2. **Every field the child sets replaces its base's whole**, lists too, so a child can drop a hand-off or a scope.
3. **As 1, with `description` required in every template** so each version in the catalogue says what it is itself.

Pick: 3. A base's hand-offs are what its charter refers to, so a child dropping one breaks the base's text; a child that needs fewer scopes builds on a smaller base. Scopes added stay within the subset rule, checked at forming as now. Each catalogue entry needs its own one line.

### 4. How a template names its base

Context: a blueprint names a template as `<repository>#<name>@<n>`, an existing tag, and squadrons records its commit. Docker pins by digest for reproducible builds and needs a tool to bump `FROM`.

1. **One exact version, as a blueprint does:** `<repository>#<name>@<n>`. A fix in a base reaches a child only through a new child version naming the new base.
2. **Exact, with the repository left out meaning the template's own:** `<name>@<n>` as a shorthand.
3. **A newest version** (`<name>@latest`, or a range), resolved when the catalogue is read.

Pick: 1. One reference form everywhere, and a template version means the same text forever, which is what a squadron snapshot and "a squadron never changes" rest on. Option 3 makes `implementer@2` change meaning when a base is tagged. The price is a new child tag per base fix; a helper that bumps bases, like Renovate, can come later as its own issue if wanted.

### 5. How deep a chain may go

Context: Thomas's example is three deep (Aeolus base, implementer, TypeScript implementer). Docker stops at 127 layers. Every level is one more file a reader opens to know what a ship gets. Tags make a loop possible (`a@2` names `b@1`, tagged later naming `a@2`).

1. **No limit**, a loop refused.
2. **A small limit**, such as 5 templates in a chain, base included, a loop refused.
3. **One level**: a base cannot have a base.

Pick: 2, at 5. Room for Thomas's example and one more level each side; deeper is a sign the parts want splitting, and the catalogue says so. Option 3 rules out his own example.

### 6. What a squadron's snapshot records

Context: the snapshot stores each role's template version as read; adding a member reads it, never the catalogue. Docker keeps both the final configuration (`inspect`) and its layers (`history`).

1. **The resolved template, and its chain by reference.** Each role's template as resolved (one charter, merged fields), as the snapshot holds a template now, plus the list of versions it was built from, each with repository, name, version and commit, for the console.
2. **Every version in the chain, whole, resolved when read.** The snapshot keeps the files' parts; squadrons merges them each time it needs a member's role.
3. **The resolved template only.**

Pick: 1. The flagship, adding a member and the role message read one resolved template, as they do now, so nothing downstream changes; the chain by reference is enough for the console to show where each version came from. Option 2 makes merging rules part of reading old snapshots forever.

### 7. Where base templates live

Context: a blueprint may name templates of any configured repository; the shared designer template lives in ThomasHendrickx/skills, configured with `path: squadrons`. A fleet's own repository may hold templates too.

1. **Any configured repository.** A base may live in another configured repository than its child; a child whose base's repository is not configured in the fleet is left out of the catalogue, saying which. Shared bases, the Aeolus base ship template first, live in ThomasHendrickx/skills `squadrons/templates/`.
2. **The child's own repository only.** Simpler to read; a fleet's own template cannot build on a shared base.
3. **ThomasHendrickx/skills only** for bases.

Pick: 1. It is how blueprints already reach templates, and building a fleet's own template on a shared base is the point of sharing. A base is a template, so it needs no folder of its own.

### 8. Whether a template may be a base only

Context: in Docker any image runs, a base or not. A template today must have `description`, `checkIn` and `charter`, so any template can be formed. An Aeolus base ship template may have no sensible `checkIn` of its own.

1. **Every template is complete and can be formed**, a base too (with a `checkIn` a child may replace).
2. **A template may say it is a base only:** it may leave out `checkIn`, and no blueprint may name it; the template that builds on it must complete it.

Pick: 1. One kind of file and one rule; a base that can be formed can be tried on its own; a base's `checkIn` is a fair default each child replaces.
