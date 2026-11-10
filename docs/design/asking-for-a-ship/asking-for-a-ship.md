# Asking for a ship by what it does

## Approved purpose

A person asks for a ship by what it does, gives it a request, and gets a ship that is crewed and starts on that request without the person arranging how it runs.

This is for a business user. Templates describe the work available to ask for. Some are single, with at most one ship of that template at a time in a fleet; others are multiple, with one ship per request. These are the needs in [#41](https://github.com/ThomasHendrickx/aeolus-fleet-squadrons/issues/41), not an agreed implementation or an ownership rule.

Thomas approved this purpose, option 1. His direction, verbatim:

> We do need to look at this from the user experience, not technical. UX first, and technical follows after that.

## Lessons to check against

1. **Start with the person's work.** The person should not need to choose a blueprint, assemble hand-offs, supply a workspace or paste a crew line to get started. Today's forming flow needs those parts supplied by files or the forming actor. Hiding a developer form would leave that work with the person.
2. **Keep core content-blind and ship-agnostic.** Core commissions ships, enforces scopes and reach, keeps crew requests and delivers messages. It does not interpret a business request, select work or coordinate execution. Squadrons already owns templates, blueprints and forming, in its own process and database (0017). Any proposed change to that boundary needs an explicit question, not an assumed exception.
3. **Build on the template that actually runs.** Templates are versioned files in configured repositories. A base is built into a complete template with a recorded chain; forming keeps a snapshot. A template, a template version, a ship type and a squadron role are different concrete parts. Today's role count and role type belong to one squadron, so neither establishes the fleet-wide single-template guarantee.
4. **Permission to ask and the ship's powers are separate.** Today `squadrons:form` permits forming, and template scopes must be held by the forming ship, checked again by core through `ownerOf`. This is no per-template permission to ask. A scope says what an actor may do, while network rules say where. Receiving a request through a plugin does not grant its sender new rights (0046, 0057).
5. **Ownership answers accountability, not who happened to ask last.** A ship has one owner, a person ship or argo; questions, gates and trouble go there (0045). Today squadrons uses the forming ship's owner. A single ship serving several people makes that existing default a design question. The asker, the owner and other people using the ship must not silently become interchangeable. Argo is the fail-safe, not the normal destination for work.
6. **Reach must be explicit.** Owners reach their ships; replies have a built-in route; squadron members reach one another through declared rules. Asking for a shared ship does not by itself give lasting send, read or manage reach, or access to another person's request. Meetings can let invited participants converse, but do not decide ownership or settle conflicting requests (0034, 0061).
7. **Commissioned, crewed and started are different facts.** A workspace enables today's crew request; the trierarch plugin assigns it and a trierarch starts a session. A member then checks in, receives its charter and says it is on station. `crew.firstPrompt` is first-start only. Neither commission nor a crewed status proves that the person's request reached the crew or that work began.
8. **A retry must keep the person's request.** Today's form stores its answer per forming ship and key; core separately makes commission and send repeatable. Forming retires ships it commissioned when a step is refused. The new flow must account for simultaneous asks, lost answers, partial forming and restarts without losing a request or creating a second single ship. Message acknowledgement proves receipt, not completion of the requested work (0040).
9. **Single does not settle conflicting work.** One exclusive crew lease does not establish how two people's incompatible requests are handled. Ordering, refusal, cancellation and who may steer the ship need answers before an implementation can claim to serve both people.
10. **Keep a person's entry outside the admin console.** People act through their accounts and person ships in their app, chat or gateway; core's console is for fleet administration (0043, 0054, 0057). Where the person asks and what they can discover need to fit that existing boundary. Discovery today describes reachable ships and types, not templates that do not yet have ships (0047).

## How it works today

The [squadrons documentation](../../squadrons.md) describes this existing path, not a proposed flow for asking for a ship:

```mermaid
flowchart TD
    A[Configured repositories: templates and blueprints] --> B[Read tagged versions and build template bases]
    B --> C[Console form or forming ship sends a blueprint reference]
    C --> D[Check scopes, settings, parameters, labels and limits]
    D --> E[Commission flagship and members with forming ship's owner]
    E --> F[Write crew requests for members with workspaces]
    F --> G[Trierarch plugin assigns; trierarch starts crew]
    G --> H[Member checks in; flagship gives charter and hand-offs]
    H --> I[Member says on station; all members on station means Sailing]
    D --> J[Refuse before commission]
    E --> K[If forming fails, retire commissioned ships]
    F --> K
```

- A template contains charter, check-in interval, hand-offs, parameters, scopes, labels and optional crew settings. A blueprint chooses versioned templates, role counts and hand-off bindings. A base changes how a template is built, not how a person requests work.
- Forming by message requires `squadrons:form`, a blueprint reference and a key. Members formed this way require workspaces and are crewed by crew requests; secrets never travel in these messages.
- The flagship relays between members and the forming ship. A retired forming ship's owner takes its place under the existing scopes. This is not yet a route for several independent askers to a single ship.
- Limits bound squadrons per fleet, squadrons per forming ship and members per squadron. They do not impose at most one ship of a template across a fleet.
- Existing template scopes describe powers granted to members. They do not identify which people may ask for which templates. The issue's access premise therefore needs clarification rather than a claim that per-template access exists today.

## Questions about the person's experience

Answers marked approved are agreed behavior; unanswered options and picks remain proposals for discussion. Start with asking, waiting and working with the ship; permissions and ownership follow from that experience. Technical design follows later.

### 1. How does a person find and ask for the work they need?

1. See the kinds of work available to them, each described in everyday words, choose one and describe their request.
2. Describe their need in a conversation and have a ship suggest what to ask for, confirming before starting.
3. Offer both, so a person can browse or describe their need.

**Approved answer: option 1.** The person picks from a list of kinds of work described in everyday words, then describes the request.

**Pick: 1.** It gives the person a clear promise of what they can ask for without requiring them to know ship names or how ships run. A conversational route can follow if needed.

### 2. What does the person see while their ship gets ready?

1. Stay on a waiting screen until the ship starts.
2. Get a confirmation that the request is kept, see whether the ship is getting ready or has started, and be told when it starts; they can leave and return.
3. Get only a message once the ship has started.

**Approved answer: option 2.** The person gets confirmation that the request is kept, then sees "getting ready" or "started", and gets a notice when it starts. They can leave and come back. If starting fails, the request stays and they are told what they can do.

**Pick: 2.** The person knows their request was received and can leave without wondering whether to ask again. If starting fails, show that it has not started, keep the request visible and explain what they can do next without asking them to arrange how the ship runs.

### 3. What does the person get when work starts?

1. A conversation with the ship, showing the original request, where the ship says it has started and later asks for clarification or gives the result.
2. A page showing progress and results, without a conversation.
3. A notification that it started, with results sent later.

**Approved answer: option 1.** The person gets a conversation with the ship, opening with their request. The ship says it started, asks for clarification there and gives the result there. Ready is never shown as started.

**Pick: 1.** It gives the person a place to continue the work, correct a misunderstanding and see the result. A ship being ready alone must not be presented as having started the request.

### 4. What happens when the work uses a single ship that already exists?

1. Let the person give that ship a request, clearly saying it is shared and whether their request has started or is waiting; do not show other people's conversations merely because the ship is shared.
2. Say the ship is already in use and ask the person to return later.
3. Ask the person already using it to let the next person use it.

**Approved answer: option 1.** The person gives the existing ship their request too. It says the ship is shared and whether their request started or waits; nobody sees other people's conversations.

Thomas's note, verbatim:

> Type of ship can define that it should always be bespoke, so unique per request. Then those are never shared.

**Pick: 1.** Single means one ship for that work in the fleet, rather than one person's exclusive possession. People can still ask for work without finding and negotiating with the previous asker. This does not yet settle which requests can run together.

### 5. What happens when two people's requests conflict on that ship?

1. Finish the earlier request before starting the later one, even when their outcomes conflict.
2. Tell the people their requests conflict and pause the conflicting work until the ship's owner gives direction; do not expose either person's private request to the other.
3. Give the later request priority and stop the earlier one.

**Approved answer: option 2.** Both people are told their requests conflict and that work pauses until the ship's owner decides. Neither sees the other's request. Requests that do not conflict keep going.

Thomas's note, verbatim:

> Can be also set as a policy / rule on a ship by the owner (not natively in aeolus core) on how to handle conflicts

**Pick: 2.** Arrival order should not silently decide incompatible business outcomes. Each person sees what is happening to their own request, and one accountable person resolves the conflict. Ordinary requests that do not conflict need not wait for that decision.

### 6. What can a person do after asking?

1. Follow up, clarify or ask to stop their own request, without changing other people's work or ending a shared ship.
2. Direct all work on the ship, including stopping other people's requests.
3. Read the result only; a change requires another request.

**Approved answer: option 1.** The person can follow up, clarify or stop their own request. They cannot change other people's work or end a shared ship. Stopping shows whether it worked, never that completed actions were undone.

**Pick: 1.** The person can steer the work they asked for without becoming responsible for everyone using a shared ship. Asking to stop must show whether stopping succeeded, rather than implying completed actions were undone.

### 7. Who can ask for each kind of work?

1. Everyone in the fleet can ask for every kind of work.
2. People see and can ask for the kinds of work their organisation has allowed them to use; work they cannot use is left out.
3. Everyone sees every kind of work, but must request approval for anything they cannot yet use.

**Approved answer: option 2.** People see the kinds of work their organisation has allowed them to ask for; the rest is not shown. Being allowed to ask is separate from what the ship itself may do. The organisation sets both.

**Pick: 2.** The choices shown are usable promises. Asking for work should not also require permission to perform every action the ship does; the organisation must decide both who may ask and what the ship may do. Whether requesting access is needed can be considered separately.

### 8. Who answers for the ship when it needs a decision?

1. The first person who asks owns it, including a shared ship.
2. The asker owns a ship made for their request; a single shared ship has a named owner chosen by the organisation before people use it. People can see who answers for it.
3. The organisation names the owner for every ship, including those made for one person's request.

**Approved answer: option 2.** The asker owns a ship made for their request. A single shared ship has an owner the organisation names beforehand. Everyone can see who answers for it. Clarifications about a request stay in that person's conversation.

Thomas's note, verbatim:

> A ships owner is the one requesting it's existence. A template (or whatever we call it) also has a template owner.

**Pick: 2.** A ship made for one person's request has a clear person to turn to, while a shared ship's questions and conflicting requests do not become the first asker's responsibility by accident. Clarifications about an individual request belong in that person's conversation; decisions the ship's owner must make go to its owner under the existing ownership rule.

## The person's journey

This journey joins the eight approved answers. Where an answer leaves behavior open, the journey names the question below rather than choosing it.

```mermaid
flowchart TD
    A[Find an allowed kind of work] --> B[Describe the request]
    B --> C[Confirmation: request kept]
    C --> D{Bespoke or shared?}
    D -->|Bespoke| E[A ship unique to this request gets ready]
    D -->|Shared| F[Use the single ship; say it is shared]
    F --> G[Show whether this request waits or starts]
    E --> H[Conversation opens with the request]
    G --> H
    H --> I[Ship says it started; person gets a notice]
    I --> J[Clarify and follow up in the same conversation]
    J --> K[Result in that conversation]
    E --> L[Starting fails: keep request and explain next action]
    G --> L
    J --> M[Conflicting work pauses; tell affected people privately]
    M --> N[Owner decides or owner-set policy handles conflict]
    N --> J
    C --> O[Person asks to stop their own request]
    J --> O
    O --> P[Show whether stopping worked; completed actions stay completed]
```

### Find and ask

The person sees kinds of work their organisation allows them to ask for, described in everyday words. They choose one and describe the request. Permission to ask does not give the person the ship's own powers.

For example, a person chooses work described as preparing a customer proposal and describes the proposal they need. They do not arrange how the ship runs. A bespoke ship belongs to this request and is never shared. A single ship serves more than one person's requests; the person is told it is shared.

### Wait and return

The person gets confirmation that the request is kept. They see "getting ready" or "started" and, for a shared ship, whether their request waits or has started. They can leave and return. A ready ship is not shown as having started the request. When work starts, the person gets a notice.

If starting fails, the request stays and the person is told what they can do. The precise next action and who helps when they cannot resolve it remain question 12.

### Work in the conversation

The conversation opens with the person's request. The ship says it started, asks that person for clarification there and gives the result there. The person follows up in that conversation. Returning to a shared ship does not reveal other people's conversations.

A ship made for this request is owned by the asker. Everyone can see who answers for a shared ship. Who requests that shared ship's existence, and how this relates to the template owner, remain question 9.

### Share a single ship and handle conflicts

Another person asking for the same shared work gives that ship their own request and sees whether it waits or starts. Neither person sees the other's conversation.

If their requests conflict, both are told, without seeing the other request. The conflicting work pauses for the owner's decision; work that does not conflict keeps going. The owner may set a policy on the ship for handling conflicts, outside core. How the owner supplies that policy, and what people see when it applies, remain questions 10 and 11.

### Stop one's own request

The person can ask to stop their own request, including while it waits. They cannot stop someone else's work or end a shared ship. The outcome says whether stopping worked. It never implies that actions already completed were undone. What happens to a bespoke ship after stopping or completing its request remains question 13.

### Happy and unhappy paths

| Situation | What the person sees and does | What remains open |
| --- | --- | --- |
| Bespoke work starts normally | Choose allowed work, describe the request, get confirmation, leave or wait, get a start notice, continue in the conversation and receive the result there | What the ship does after the request ends, question 13 |
| A single shared ship already exists | Give it a request, see that it is shared and whether this request waits or starts, then use a private conversation for the work | What explains a wait, question 11 |
| The ship needs clarification | Answer in the conversation that contains the original request | None for this step |
| Starting fails | Keep the request visible and explain what the person can do; do not call it started | Retry and help, question 12 |
| Two requests conflict | Tell each person privately; pause conflicting work for the owner or the owner's policy; keep other work going | How the policy is supplied and the outcome explained, questions 10 and 11 |
| The person leaves before work starts | Return to the kept request and its current status; receive a start notice when work starts | None for leaving and returning |
| The person wants to stop | Ask to stop their own request and see whether it worked; previously completed actions are not presented as undone | What happens to a bespoke ship afterward, question 13 |
| The person wants work they are not allowed to ask for | That kind of work is absent from their choices | No access-request flow is proposed here |

## Questions raised by the journey

The options and picks below are proposals awaiting answers. They concern the person's experience, not API, data or package placement.

### 9. Who requests a single shared ship's existence?

1. The template owner requests its existence before people can use it and becomes the ship's owner.
2. The organisation names a person to request its existence before people can use it; that person owns the ship and may differ from the template owner.
3. The first person asking for work requests its existence and becomes its owner.

**Pick: 2.** It preserves both approved statements: the owner requests the ship's existence, and a shared ship's owner is named beforehand. A template owner answers for the reusable kind of work without necessarily answering for every shared ship using it. Option 3 would change the approved experience that shared ownership is settled beforehand.

### 10. Where does the owner give the ship its conflict policy?

1. In the owner's conversation with that ship, where the owner can also ask what policy it follows and change it.
2. On the template, supplied by the template owner for every ship using it, with no change by an individual ship's owner.
3. On a page for managing the ship, where the owner reads and changes its policy.

**Pick: 1.** The owner steers the ship where they already converse with it. The ship confirms the policy it will follow so it is visible rather than assumed. This proposes an experience on the ship, not native policy enforcement in core.

### 11. What does a person learn when a shared request waits or a conflict is resolved?

1. Only "waiting" until their request starts or is refused.
2. A reason about their own request, such as waiting to start or waiting for an owner's decision; after a conflict decision, whether their request will continue, remain waiting or cannot proceed, with an explanation that reveals no other request.
3. A shared list of requests, their order and the owner's decisions.

**Pick: 2.** The person can understand what happens to their work without seeing another person's request. No time estimate is promised without a basis for it.

### 12. What can a person do when starting fails?

1. Try starting the same kept request again, or ask the named ship owner for help from that request; show whether a retry is underway.
2. Describe and submit the request again from the beginning.
3. Wait for the owner to fix it, with no action available to the person.

**Pick: 1.** The person keeps the work they already described and gets a concrete next action. When no ship yet exists, who is named for help depends on the answer about who requests its existence; that must be settled before this experience is promised.

### 13. What does the person keep after bespoke work finishes or is stopped?

1. The conversation and result remain available, but the ship accepts no further work; a new request gets a new bespoke ship.
2. The conversation and ship stay available for follow-up on that request; asking for different work creates a new bespoke ship.
3. The conversation and ship are no longer available.

**Pick: 2.** The person can ask about the result or clarify what stopping accomplished without making the bespoke ship shared or reusing it for unrelated work. Keeping a conversation remains subject to the fleet's existing retention, not a promise to keep it forever.

## Approval boundary

The purpose, Thomas's UX-first direction and the answers to all eight experience questions, including Thomas's notes about bespoke ships, owner-set conflict policy, ship ownership and template ownership, are approved. No API, data or squadrons/core placement decisions are proposed in this round. The journey joins those answers; questions 9 through 13 and their picks await approval before implementation design.

## Sources

- [Issue #41, including Thomas's words](https://github.com/ThomasHendrickx/aeolus-fleet-squadrons/issues/41).
- [Templates, bases, blueprints, forming and check-in](../../squadrons.md).
- [Squadrons boundary, ownership and forming](../../decisions/0017-squadrons-package.md).
- [Fleet blueprint: purpose, owners, commission, scopes, network, crew requests and meetings](https://github.com/ThomasHendrickx/aeolus-fleet/blob/main/docs/blueprint.md).
- [Fleet decisions index](https://github.com/ThomasHendrickx/aeolus-fleet/blob/main/docs/decisions/README.md), especially 0017, 0026, 0029, 0034, 0040, 0043, 0045, 0046, 0047, 0050, 0053, 0054, 0057 and 0061.
- [Public core calls available to squadrons](https://github.com/ThomasHendrickx/aeolus-fleet/blob/main/docs/compatibility.md).
