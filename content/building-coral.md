# Building Coral

## Before I Stepped into the World of Agents

Claude Code came out in the same month I started working on the Windows EFA driver at AWS. Back then, my day-to-day work was deep in Windows kernels, operating-system internals, and disassembled code.

When Claude Code appeared, my colleagues and I talked about it. We felt pretty safe about our jobs. Surely this kind of low-level work was too specialized for an AI coding agent. Surely it couldn't reason about Windows internals as well as the people who had spent years working on them.

I left AWS a year later, in April 2026. By then, roughly a month before I left, we had a tool that connected WinDbg to Kiro, backed by Claude Opus. In one case, it triaged a kernel issue at least 20 times faster than we could. It accurately diagnosed the problem, proposed fixes, and, unlike us, never needed a break from staring at a screen full of assembly.

After AWS, I joined a startup working on AI agents and related systems. That was when I really started using coding agents seriously and thinking about agents beyond coding. I began looking at general agents, agents that could keep learning, and what it would mean for an agent to stay with someone over time.

I suddenly found myself trying to understand the relationship between a model and an agent, how these systems were designed, and what all the famous open-source frameworks were actually doing.

This blog is a record of where that exploration took me, what I built over the past few weeks, and the mistakes that eventually led me to Coral.

## The Problem with a Personal Agent

Paperboy is trying to build a highly personal AI agent. In the beginning, we carefully designed the heuristics. We built a multi-agent system in which every agent had a different, very specific job, then tried to make those agents work together as one personal assistant.

As we added more tools and functionality, though, the deeper problem started to show itself.

A personal agent lives in an ever-changing world. It isn't solving a one-time task with a clean input and a final output. The stream of events never really stops. What the user needs changes, what the system knows changes, and the useful context changes with both of them.

That made our original approach feel increasingly fragile. If we manually decided exactly what every agent could do and exactly what context it could see, how long could that design remain personal? Maybe for one task. Maybe for one day. But what about a week, a year, or several years?

The models were getting stronger, but the system around them was still fixed.

We obviously weren't the first people to run into this. Everywhere I looked, I found people approaching it under different names: continual learning, continual harnesses, and loop engineering. I don't care too much about which term eventually wins. They all point in the same direction: we want agents that can learn, adapt, and evolve instead of starting from the same fixed context every time. But we also know this is a difficult problem. How do we make sure an agent is evolving in the right direction instead of getting stuck in a local optimum?

Once we move from a single agent to a group of agents, the question gets even harder. Multiple agents can divide responsibilities, keep their contexts focused, and help one another. But now there is more than one evolving thing. The relationships between the agents can change. Their responsibilities can overlap or drift. Even the shape of the system can evolve.

So the question I ended up wrestling with was this: if one agent can improve itself, how do we bring that ability to an entire swarm while keeping its evolution understandable to both the agents inside it and the humans overseeing it? And how do we give both enough evidence to evaluate its direction and respond when necessary?

## My First Design: Make Everything an Event

A self-evolving agent swarm is a very sexy idea. New agents can appear, old ones can disappear, and their responsibilities and relationships can change over time. It feels a little like graph engineering wrapped around a higher-level loop-engineering process.

The problems are also obvious:

1. How do we control the evolution?
2. How do we understand what is happening inside the swarm?
3. How do we know whether the agents are actually getting better?
4. How do we know whether the swarm itself is getting better?

That understanding isn't only for the humans building and using the system. The agents need it too. If they are going to drive the evolution, they need to understand what changed, why it changed, and what happened as a result.

My first answer was an Event Ledger.

The idea seemed simple: define a vocabulary of events, then make every durable action inside the swarm representable as one of those events. If the events were expressive enough, replaying the Ledger would reconstruct the trajectory of every agent and of the swarm as a whole.

I started building that system on top of Pi as the single-agent harness. I gave the agent one extra framework tool, `emit_event`, and put an Event Kernel behind it. The Kernel admitted event drafts, committed them to the Ledger, projected the resulting state, and triggered whatever was supposed to happen next.

To let agents do real work, I introduced something called an Extension. An Extension defined a semantic protocol: its event vocabulary, projections, constraints, dispatch rules, and the code that translated those events into actual effects.

I took this idea pretty far. Even agent-to-agent communication became an Extension. It defined events such as `communication.message.sent`, `communication.task.requested`, and `communication.task.completed`. An agent would emit an event containing a target and a message, and the Extension would deliver it to the other agent.

I did the same for external capabilities. I built a Composio integration around the locally authenticated Composio CLI. It defined events such as `composio.search`, `composio.execute`, and `composio.link`, then translated committed events into real CLI operations.

I wanted every durable action to be an event. At first, that still felt reasonable.

Then I tried to add self-evolution.

An evolving agent needs to change its own context, memory, tools, and behavior. It may also want to suggest changes to another agent or to the swarm itself. In my event-first architecture, every one of those possible changes needed to be designed and exposed in advance.

I ended up giving each Extension an owner-controlled edit contract called a `ChangeSurface`. A `ChangeSurface` exposed a narrow subset of the Extension's event vocabulary as the changes the evolution system was allowed to propose.

It became incredibly messy. The mechanism limited what an agent could change, made every Extension harder to design, and somehow made the whole system more difficult—not easier—to audit.

Eventually I needed an entire Graph Extension just to describe and evolve the swarm. That Extension owned the `graph.*` event vocabulary, the graph projection, the graph constraints, and its own `ChangeSurface`s.

At that point, everything was spinning out of control. I wasn't unleashing the capabilities of the models. I was building a more elaborate cage for them.

In the end, it was still heuristics. The agents could only evolve along paths I had personally imagined and exposed through a `ChangeSurface`.

The lesson was not that events were useless. A swarm still needs a shared history. The mistake was asking the event vocabulary to do two different jobs at once: describe what had happened *and* define everything an agent was allowed to do.

Those are not the same problem. An audit record should describe a durable fact after the system has validated it. It should not become a smaller, hand-written programming language that the model is forced to use for every action.

## Going Back to Code

I went back to a more basic question: how do modern agents actually solve problems, and what are today's models already unusually good at?

The answer is code.

Modern models are incredibly good at producing and reasoning about code. I can only guess at all the reasons, but code has one very useful property: you can execute it. A model can write a program, run it, see what happened, and keep iterating. The result doesn't have to remain an idea inside the model's context window. It can do something in the world.

Code is the hand. It is close to a universal interface between an agent and its environment.

We already have capable coding agents such as [Codex](https://openai.com/index/introducing-the-codex-app/), [Claude Code](https://code.claude.com/docs/en/overview), and [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent). They can inspect repositories, modify code, run commands and tests, and keep working toward a result.

So I decided to begin there instead of inventing another constrained language for evolution.

What does it actually mean for a single agent to evolve? A large part of it is learning how to build a better context for its next turn. Memory systems, skills, context engineering, and compaction are all, in one way or another, attempts to help an agent organize what it knows and decide what should come back into the context window.

But an agent's editable self is bigger than its context. It includes its instructions, memory, skills, code, tools, tests, and the code it uses to assemble that context.

What if all of that simply lived in a workspace?

```text
AGENTS.md
context.ts
context/
  initial.md
memory/
skills/
src/       # optional
test/      # optional
```

`AGENTS.md` can describe the agent's role. `context.ts` can decide how its next context is assembled. Memory and skills can be ordinary files. If the agent needs a Bash tool, a program, or a one-off script, it can write one.

Then the instruction to the agent becomes very simple: this workspace is where you build yourself from.

The agent can edit that workspace in the same way a software engineer edits software. It can reorganize memory, rewrite its instructions, change its context policy, add a skill, build a tool, or add a test. That is self-evolution without a special evolution language.

The smallest useful layer around an already capable coding agent is surprisingly small: a good coding harness, an ordinary workspace, and enough initial guidance for the agent to understand what it is allowed to change.

Auditability also becomes much easier. Make the workspace a Git repository.

Every accepted change becomes a Git commit. Git gives us the exact tree, its parent, the diff, and the complete history of how the agent changed itself. Coral records an `agent.workspace.committed` Event pointing to that commit. Git preserves *what* changed; the Ledger preserves where that change belongs in the causal history.

Now apply the same model to every agent in a swarm. Each agent owns its own workspace and evolves independently. Agents can inspect read-only snapshots of one another and send suggestions, but they don't reach into another agent's workspace and edit it directly.

An Auditor can examine the evidence available across the swarm—communications, outcomes, workspace snapshots, and harness trajectories—and suggest improvements to the responsible agent. It doesn't need special authority to make those changes itself.

That solved self-evolution for one agent. But it also exposed the next boundary: changing one workspace is not the same thing as changing the swarm.

## From Evolving Agents to an Evolving Swarm

That distinction became central to Coral. An agent can commit a workspace change and use it on its next turn. The change affects only that agent; it does not automatically become a proposal to redesign the whole swarm.

A swarm-level Revision is different. It captures the complete Swarm Definition and the exact workspace head of every agent at one point in time. It is an immutable snapshot of what the whole system was.

The live agents may continue changing after that Revision, just as development continues after a Git tag.

This also corrected one of the biggest mistakes in my first design: Coral does **not** try to turn everything into a Ledger Event. The goal is not a universal log. The goal is a history we can reconstruct.

```text
Native Harness trajectory
  model messages, tool calls, and execution details
                 ↓ checkpoint reference
Event Ledger
  high-level causal history of turns, communication, and evolution
                 ↓ exact commit IDs
Git workspaces
  the complete content of each agent's editable self
```

### Why Events Still Matter

For one evolving agent, Git and the harness trajectory already tell us a lot. Git shows how its workspace changed, and the harness shows what happened inside a turn.

The need for Events becomes clearer when that agent joins a swarm. Several agents now evolve independently. Communications happen asynchronously, Forks diverge, and a human may eventually promote one candidate over another. Each component can have a correct local history while the system has no shared account of how those histories fit together.

That is the job of the Ledger. It connects a Communication to the turn it triggered, the turn to the workspace commit it produced, and those local changes to the Proposal, Fork, decision, and Revision that affected the whole swarm.

Coral only records these durable boundaries. Each Event identifies its actor, scope, causes, and references to the deeper evidence in Git or the harness. Replaying the Ledger is then enough to recover the active Revision, the visible history of every Fork, and the causal path from an input to a human decision.

Moving from one evolving agent to an evolving swarm is exactly why Events still matter.

### Turns and Communication

Most activity inside the swarm starts with a Communication and becomes visible through a turn record.

`communication.sent` is the system's input and output primitive. It records a sender, one or more recipients, and structured content. The sender can be a human, a Plugin, or another agent. If one agent sends to another, the active Swarm Definition must contain that route. The Communication enters the recipient's mailbox and eventually triggers a turn.

`agent.turn.recorded` records one logical invocation of an agent's native harness. It connects the input Event IDs, the workspace state before and after the turn, the outcome, and a checkpoint for the native harness session.

The Ledger does not copy private chain-of-thought or every tool call into this Event. Those details belong to the harness trajectory. The smallest auditable unit in Coral is one logical turn connected to its causal inputs, its before-and-after workspace state, and its native trajectory checkpoint.

With the read-only `coral review` command, an agent can browse its visible Ledger history, inspect one Event, or follow a turn into its native harness trajectory. Review creates no new Event, and a Fork only sees Main through its source frontier plus its own later Events.

A normal turn looks roughly like this:

```text
communication.sent                         input
  ├─ agent.workspace.committed (zero or more)
  ├─ plugin.workspace.committed (zero or more)
  ├─ *.workspace.restored (if dirty work was discarded)
  └─ agent.turn.recorded
       ├─ communication.sent (zero or more outputs)
       └─ swarm.revision.proposed (at most one)
```

### Workspace Events

There is no separate workspace-revision abstraction. Git commits already provide the version history. The Ledger only records the lifecycle facts around them.

| Event | Meaning |
| --- | --- |
| `agent.workspace.initialized` | Coral created the agent's root workspace commit. |
| `agent.workspace.committed` | The agent made an accepted commit during a turn. That commit immediately becomes the agent's next local state. |
| `agent.workspace.restored` | The agent left dirty, uncommitted changes, so Coral discarded them and restored the accepted head. |
| `agent.workspace.reapplied` | During activation, Coral successfully reapplied a Main commit made after the Proposal onto the selected Fork head. |

Plugin workspaces have a smaller parallel vocabulary:

| Event | Meaning |
| --- | --- |
| `plugin.workspace.initialized` | Coral created or imported the Plugin's Git workspace and initial draft head. |
| `plugin.workspace.committed` | An authorized agent committed an accepted change to the Plugin draft. The running Plugin is still unchanged. |
| `plugin.workspace.restored` | Coral discarded uncommitted Plugin changes and restored the accepted draft head. |

That last distinction matters. An agent can improve Plugin code, but the new code does not become live until a later human-approved swarm Revision pins that exact commit.

### Swarm Events

Before listing the events, four words need precise meanings:

- A **Swarm Definition** describes the complete composition: agents, harness and model bindings, communication routes, Plugin ingress and pins, and tests.
- A **Proposal** is a complete candidate change submitted by an agent. It does not run and it does not modify Main.
- A **Fork** is an isolated, mutable running state created from a Proposal or an earlier Revision. It is roughly the swarm equivalent of a Git worktree.
- A **Revision** is an immutable snapshot of the complete swarm. Only an approved Fork becomes a new Revision.

From those four objects, the swarm lifecycle only needs four Events:

| Event | Meaning |
| --- | --- |
| `swarm.revision.proposed` | An agent submitted a complete, valid Swarm Definition. Coral pinned its base Revision, agent heads, Plugin commits, tests, and causal evidence. Main keeps running unchanged. |
| `swarm.fork.created` | A human created an isolated Fork from a Proposal or stored Revision. The Fork gets its own Event scope and workspace heads. |
| `swarm.decision.recorded` | A human approved or denied one exact Fork frontier. If the Fork changed after inspection, the old decision cannot silently apply to the new state. |
| `swarm.revision.activated` | Coral atomically promoted the approved frontier into a new immutable Revision and made it Main. |

My first idea was to shadow every live input through Main and every candidate Fork, then compare their outputs over time. Coral's current evaluation model is more controlled than that.

A Proposal carries fixed test Communications and expected Event types. A human can create one or more Forks and run those pinned tests in isolation. Plugins that are live on Main are forced into mock mode in the Fork, so an evaluation cannot accidentally repeat real-world side effects. The turns, Communications, test results, and workspace changes produced inside the Fork become the evidence for the decision.

An Auditor can read that evidence and recommend a choice, but it cannot create, approve, or activate a Fork. Today, that authority stays with a human.

```text
Main at Revision R0
  │
  ├─ agents keep evolving their own workspaces
  │
  └─ swarm.revision.proposed → Proposal P1
                                  │
                         human creates Forks
                             ┌────┴────┐
                            F1         F2
                         isolated tests and evolution
                             └────┬────┘
                      human chooses an exact frontier
                                  │
                    swarm.decision.recorded
                         ├─ denied  → history remains
                         └─ approved
                                │
                    swarm.revision.activated → Revision R1 → Main
```

Main doesn't have to freeze while a Proposal is being evaluated. If its agents have made later workspace commits, Coral tries to reapply them on top of the selected Fork during activation. If the commits apply cleanly, the history continues. If there is a Git conflict, activation fails and the old Main remains intact.

### Why This Event Vocabulary Is Enough

I don't think it would be honest to call this the best Event design for every agent system. Event design depends on what a system needs to reconstruct. But for Coral, I think this is the right boundary—and the smallest vocabulary that still captures the whole evolution process.

The vocabulary answers four questions: what entered or left the swarm, which turn processed it, how an agent's editable state changed, and how a candidate became—or did not become—the new Main. Remove any one of those boundaries and part of the evolution becomes ambiguous.

But Coral stops there. Tool calls, queue operations, screenshots, and external side effects already belong to the harness, Git, or a Plugin store. Test results can be projected from a Fork's fixed inputs and resulting Events instead of being repeated in a separate `swarm.fork.evaluated` Event.

The design is expressive because the Events compose and point to deeper evidence, not because there is an Event type for every verb. That is what keeps the vocabulary small without losing the history we need.

This was the internal boundary I had been looking for. An agent could evolve locally and directly, while changes to the whole swarm remained isolated, testable, human-gated, and reconstructable.

One question was still open: how could these agents interact with the outside world without bringing back the giant event vocabulary from my first design?

## Plugins: The Final Little Spice

That is the job of a Plugin.

I wanted this boundary to stay simple, so a Plugin is ordinary Git-backed code with two faces. Its runtime receives something from the outside world and emits an inbound Communication. Its CLI lets an agent act in the other direction.

```text
outside world → Plugin runtime → communication.sent → agent
agent → Plugin CLI → Plugin or outside world
```

The asymmetry is intentional. An outward action remains a normal harness operation through the CLI instead of becoming another Agent-authored Event. If that action later produces a new fact for the swarm, the Plugin runtime can emit a new inbound Communication.

Chat is a simple example: a human message enters through the runtime, and Chat Agent replies through the CLI. Screen emits a Communication when foreground activity is ready, while its CLI lets an authorized agent load the corresponding OCR and local image paths.

The Swarm Definition controls both directions. It declares which agents receive a Plugin's inbound Communications and which agents may use its CLI. A Plugin may also include a prompt and a small View extension, all versioned together at one exact Git commit.

Agents can improve Plugin code, but an edit only advances the draft. The running swarm stays on its pinned commit until a later Proposal evaluates the new code and a human approves it through the same Revision process used for every other swarm-level change.

That is almost the entire Plugin model. The outside world comes in through Communications, agents act through code, and changes to that boundary remain explicit and auditable.

With that, all the pieces exist: agents, routes, Plugins, tests, and the Revision process that governs them. The remaining question is what we actually write down to describe one complete swarm.

## What a Swarm Actually Looks Like

I have used the phrase “Swarm Definition” many times by now, so it is worth showing what I actually mean.

A Definition and a Snapshot are related, but they are not the same thing:

- A **Swarm Definition** says how a running swarm is composed.
- A **Snapshot** packages that Definition with the initial agent workspaces and the exact Plugin Git history needed to create a fresh instance.

The agents' prompts, memories, skills, tools, and `context.ts` files do not live inside the Swarm Definition. They live in the agents' workspaces, because those files are exactly what the agents will evolve.

A Definition only needs to declare:

- the agents and their harness, model, effort, and turn policy;
- the allowed communication routes;
- the Plugin ingress routes;
- the Plugins, exact Git pins, modes, commands, and CLI exposure; and
- the fixed tests used to evaluate Forks.

Here is a small, complete example with a Chat Agent and a Memory Agent. It is an illustration of the schema, not the four-agent Personal Agent Snapshot I describe in the final section.

```json
{
  "agents": [
    {
      "id": "chat-agent",
      "harness": "codex",
      "model": "gpt-5.6-terra",
      "effort": "high",
      "turnPolicy": "batch-events"
    },
    {
      "id": "memory-agent",
      "harness": "codex",
      "model": "gpt-5.6-terra",
      "effort": "high",
      "turnPolicy": "batch-events"
    }
  ],
  "routes": [
    { "from": "chat-agent", "to": "memory-agent" },
    { "from": "memory-agent", "to": "chat-agent" }
  ],
  "pluginIngress": [
    { "plugin": "chat", "ingressTo": "chat-agent" }
  ],
  "plugins": [
    {
      "id": "chat",
      "command": "chat",
      "commit": "efebeec9f86166431afcdc5b636fe7afb0db0a55",
      "exposedTo": ["chat-agent"],
      "mode": "live"
    }
  ],
  "tests": [
    {
      "id": "chat-shares-useful-memory",
      "inputEvents": [
        {
          "type": "communication.sent",
          "data": {
            "from": "test/chat-shares-useful-memory",
            "to": ["agent/chat-agent"],
            "content": [
              {
                "type": "text",
                "text": "The user prefers concise answers. Respond and share this preference where useful."
              }
            ]
          }
        }
      ],
      "expect": { "eventType": "communication.sent" }
    }
  ]
}
```

There are no prompts in this object. `chat-agent` and `memory-agent` are only swarm-level bindings. Their roles, context policies, memories, skills, and code belong to their own workspaces.

The Chat Plugin is pinned by a literal Git commit rather than a symbolic version. The test belongs to the Definition because a proposed change should carry the fixed behavior used to evaluate it.

To make the swarm portable, a Snapshot adds the seed workspaces and Plugin bundle:

```text
snapshots/personal-memory/
├── snapshot.json
├── agents/
│   ├── chat-agent/
│   │   ├── AGENTS.md
│   │   ├── context.ts
│   │   ├── context/initial.md
│   │   ├── memory/
│   │   └── skills/
│   └── memory-agent/
│       ├── AGENTS.md
│       ├── context.ts
│       ├── context/initial.md
│       ├── memory/
│       └── skills/
└── plugins/
    └── chat.bundle
```

The Snapshot's `snapshot.json` wraps the Definition with the paths to those workspaces and bundles. Each agent directory becomes the root of that agent's Git history, while the Plugin bundle contains the exact Git objects needed to resolve the pinned commit without changing its identity.

A Snapshot is a clean starting blueprint, not an export of a live swarm. It does not include learned instance commits, harness sessions, mailbox queues, Plugin state, credentials, connections, or secrets. Those belong to the local running instance.

The repository's bundled Personal Agent follows this same structure. Someone can create a fresh local instance of it with one command:

```bash
npm run coral -- create ./snapshots/personal-agent ./instances/personal-agent
```

“One command” doesn't mean “without prerequisites.” The machine still needs Node.js, Git, and an installed and authenticated harness. A Snapshot may also depend on an operating system or external accounts required by its Plugins. It makes the swarm reproducible; it does not pretend the outside world is portable.

That is enough to share the design and create a fresh swarm. But a clean blueprint is only the starting point. The more interesting question is what happens after it has spent some time with a real person.

## A Final Note

Coral is still a very early and primitive implementation of agent swarm evolution. I don't pretend otherwise. Underneath it is a fairly simple bet: today's models are already extremely capable—often, to be honest, smarter than I am—and we should give them room to use that capability without giving up our ability to understand what they change.

To see whether any of this is useful outside a diagram, I built a real example: a four-agent Personal Agent that I have been running locally on my laptop.

It observes my work through a Screen Plugin and lets me talk to it through a Chat Plugin. Screen does not continuously record my entire display. It captures sparse foreground-window activity when something meaningfully changes. Images and OCR remain in the Plugin's local state, and Memory Builder or Proactivity load them only when an activity appears relevant.

The four agents have different jobs. Chat Agent is the only direct conversational interface. Memory Builder tries to organize what the system learns about me. Proactivity looks for evidence about what I may need next. Auditor uses `coral review` and read-only workspace snapshots to suggest concrete improvements to the responsible agent.

I also wanted a better way to understand the swarm from the outside, so I built a UI called the View. The default Overview projects the swarm's evolution, topology, and Ledger history. An active Plugin can add its own View extension, which appears next to Overview in the top navigation. That lets Chat and Screen have their own pages without pushing their semantics into the default UI.

The View is still just a view. It projects the system and gives the human a control surface; it does not define how the swarm works.

I have been running this Personal Agent during my normal working hours, and its workspaces have evolved quite a lot. It has found ways to organize its own memory so that it can make sense of what I am doing. At times, it really does feel like it knows me.

Proactivity has been especially interesting. You could also think of it as a prediction agent. It does not rely only on the activity it receives directly from Screen. Memory Builder sends it relevant user knowledge, and Proactivity can also inspect Memory Builder's current workspace as read-only evidence.

It brings those sources together and looks for enough evidence that an interruption may be useful. When it finds something, it sends the evidence and a proposed message to Chat Agent rather than contacting me directly.

And in my own use, it is actually working. I don't have to prompt it or ask it to look over my shoulder. While I am working on code, it has sometimes noticed that something is going wrong and surfaced a relevant paper or GitHub repository. It has been genuinely helpful.

But my everyday life is also a pretty boring benchmark. Most of what the system sees is concentrated around my software work. That is not proof that the same Personal Agent will fit everyone else's life or generalize to a much wider range of activities.

That uncertainty is part of why evolution matters. The swarm should be able to adapt to the person using it, but it should leave enough of a trail for that person to inspect it, correct it, and understand why it behaved the way it did.

The most important safeguard is that swarm-level activation still keeps a human in the loop. An agent can evolve its own workspace, and agents can propose a complete new Swarm Definition. But a human must inspect the Fork, compare the evidence, and decide whether it becomes the next active Revision.

Maybe one day that authority can be delegated to a dedicated agent. In Coral today, it intentionally isn't.

As I said at the beginning, I haven't been in the world of agents for very long—only a few months. I am still trying to understand it, express what I have learned, and build something genuinely helpful that may eventually be useful to many more people.

And yes, this is Coral.

You can find the project at [siwei-yuan/coral](https://github.com/siwei-yuan/coral).

Thanks to @dozycat_ai for the support throughout the development process.
