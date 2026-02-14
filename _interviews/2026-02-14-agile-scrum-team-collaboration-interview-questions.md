---
title: "Agile, Scrum & Team Collaboration"
date: 2026-02-14
layout: interview
tags: [Behavioral Round]
order: 3
sequence: 79
description: "Many companies ask about how you work within Agile teams."
---

## Agile, Scrum & Team Collaboration

Here's the thing about Agile and Scrum questions — they sound soft, but they reveal a lot. Anyone can memorize a definition of a sprint. The real question is whether you've actually lived through the messy, human side of building software with a team. These questions come up in almost every behavioral round, and your answers need to sound like experience, not a textbook.

#### What is Agile and why do teams use it?

Think of it like this: imagine you're building a house, but your client changes their mind about the kitchen layout every two weeks. If you planned the entire house upfront and built it all at once, you'd tear down walls constantly. Agile says — build room by room, show the client after each one, and adjust.

In software, I deliver in small increments, get feedback, and course-correct. Requirements always change, so the process should welcome change instead of fighting it. Teams use Agile because it reduces the risk of spending months building something nobody actually wants. I ship small pieces frequently, users react, and I adapt. It also keeps everyone honest — the work is visible, progress is measurable, and nobody disappears into a cave for three months.

#### What is Scrum and how does it differ from Agile?

Agile is the philosophy. Scrum is one specific playbook for practicing it — like how "staying healthy" is the philosophy, and a specific gym routine is the framework. Other frameworks include Kanban, Lean, and Extreme Programming.

Scrum gives you structure — sprints (typically 2 weeks), defined roles (Product Owner, Scrum Master, Team), and ceremonies (standup, planning, review, retro). Not every Agile team does Scrum, but most use some version of it because having that rhythm keeps the team aligned.

#### What happens in each Scrum ceremony?

- **Sprint Planning** — The team picks work from the backlog for the upcoming sprint. I discuss scope, break stories into tasks, estimate effort, and commit to what I can realistically deliver. Usually 1-2 hours for a 2-week sprint.
- **Daily Standup** — A 15-minute daily sync. Each person covers what they did yesterday, what they're doing today, and any blockers. It's a status check, not a problem-solving session. The moment someone starts debugging live in standup, you've lost the plot.
- **Sprint Review** — At the end of the sprint, the team demos what was built to stakeholders. This is where I get real feedback from PMs, designers, and sometimes actual users.
- **Sprint Retrospective** — The team reflects on the sprint itself — what went well, what didn't, what to improve. This is about the process, not the product. It's the team's chance to get better at working together.

> **🧠 Think about it:** If you skip retrospectives for a few sprints, what happens to the team's process over time?

#### What are story points and how do you estimate work?

Story points measure relative effort, not hours. Think of it like rating hiking trails — a trail rated "5" isn't five times longer than a trail rated "1," but it's definitely harder. You're comparing complexity, unknowns, and effort, not clock time. The common scale is Fibonacci — 1, 2, 3, 5, 8, 13.

I estimate using planning poker — everyone picks a number independently, then we discuss disagreements. The discussion is the valuable part, not the number itself. If one person says 2 and another says 8, the 8-person probably sees complexity the rest of us missed. Story points also normalize for skill levels — a senior might finish a 5-point story in 2 hours while a junior takes a day, but the underlying complexity is the same.

#### What is sprint velocity and how is it used?

Velocity is the average number of story points a team completes per sprint, measured over 3-5 sprints. If the team consistently delivers 30-35 points, that's the velocity. It's like knowing your car gets about 30 miles per gallon — you plan your road trip around that number, not around wishful thinking.

I use it for planning — if velocity is 30, I don't commit to 50 points. It's also a trend indicator. Dropping velocity might signal burnout, unclear requirements, or too much context switching. But here's what matters: velocity is not a performance metric. Comparing velocities between teams is meaningless because each team calibrates points differently. A "5" on my team might be a "3" on yours.

#### What is the Definition of Done?

This is one where real experience matters more than textbook answers. Without a Definition of Done, "done" means whatever each person feels like it means. One engineer thinks done means the code compiles. Another thinks it means tested and deployed. You can guess how well that goes.

The Definition of Done is a shared checklist the whole team agrees on:
- Code is written and follows team standards
- Unit tests are written and passing
- Code review is approved
- Feature is tested on staging
- Documentation is updated if needed

A story isn't done until every item is checked. No exceptions, no "I'll add tests later."

#### How do you give effective feedback in code reviews?

I focus on being specific and explaining the why. "This function does three things — consider extracting the validation" is far more useful than "this is too complex." I also distinguish between must-fix and nice-to-have by prefixing suggestions with "nit:" so the author knows what's actually blocking approval and what's just a preference.

When I'm unsure about something, I ask a question instead of assuming a mistake — "Is there a reason this is a `var` instead of `val`?" opens a conversation. And I acknowledge good work too. Reviews that are nothing but criticism make people dread opening PRs.

#### How do you receive feedback on your own code?

I read feedback carefully before reacting. If I disagree, I explain my reasoning calmly — "I used a `var` here because the value changes during the animation. I could restructure, but it adds complexity for no real benefit." If the feedback is right, I fix it and move on. No ego about it.

If I don't understand the feedback, I ask. And if a reviewer catches something I knowingly cut corners on, I own it. Pretending it was intentional design fools nobody.

> **🧠 Think about it:** What's the difference between defending a technical decision and being defensive about your code?

#### How do you collaborate with product managers who don't have technical context?

The PM thinks in user stories and business metrics. I think in architecture and implementation complexity. It's like a restaurant — the PM is the customer ordering from the menu, and I'm the chef who knows which dishes take 10 minutes and which take 2 hours. My job is to bridge that gap.

I translate technical constraints into business impact — "Adding offline support requires a local database and sync logic. That's 2 sprints instead of 1, but users won't lose data on subway commutes." I don't just say "it's hard" — I explain what makes it hard and what the alternatives are. If a story looks bigger than expected during grooming, I flag it right then. Waiting until mid-sprint to surface a surprise is a recipe for trust issues.

#### How do you handle a blocker that's outside your control?

Blockers happen — waiting on a backend API, a design that isn't ready, a dependency on another team. I raise it immediately in standup and message the relevant person directly. If I get no response in 24 hours, I follow up again. Politely, but persistently.

If I can work around it, I do — mock the API and build against the contract, or use placeholder UI and implement the logic. If I genuinely can't work around it, I pick up another story from the backlog. Sitting idle and waiting is the worst possible option. There's always something productive to do.

#### How does your team handle knowledge sharing?

Knowledge silos are like having a single point of failure in your architecture — eventually, that one person goes on vacation and everything grinds to a halt. I handle this through pair programming on complex features, rotating code reviews so I regularly review areas I'm less familiar with, and doing code walkthroughs after large features ship.

I also keep documentation current — not detailed prose, just enough for a new person to orient themselves. The goal is that any team member can pick up any area of the codebase within a day or two without having to corner someone in Slack.

#### How do you work effectively in a remote or distributed team?

Remote work requires deliberate over-communication. In an office, context spreads through overheard conversations and hallway chats. Remote? If you didn't write it down, it didn't happen. I document decisions, share context in PRs, and write clear commit messages.

I lean heavily on async communication — a Slack message or a short Loom video often works better than scheduling yet another meeting. And I stay responsive. Even a quick "Saw this, will look after lunch" goes a long way toward keeping trust high. Regular 1-on-1s with the PM, designer, or cross-team dependencies prevent the kind of slow misalignment that only surfaces weeks later.

#### What makes a good sprint retrospective?

A retro that doesn't produce action items is just a group therapy session. The whole purpose is to identify one or two concrete improvements the team actually commits to for the next sprint.

I follow a simple structure — what went well, what didn't, and action items. I keep action items to 1-2 with assigned owners. If I pick 5 improvements, none of them happen. Here's the part most teams skip: at the start of each retro, I check last sprint's action items to see if we actually followed through. If the same issue shows up three retros in a row and nothing changes, I escalate it. A retro without accountability is just venting.

> **🧠 Think about it:** If your team has the same complaint in retro three sprints in a row, what does that tell you about how the team handles process improvements?

#### How do you handle scope creep during a sprint?

Scope creep is like someone adding extra stops to your road trip after you've already planned your gas and timing. Some amount is inevitable, but unchecked scope creep means the team never delivers what it committed to.

My approach is simple — new work goes to the backlog by default unless it's a critical bug or a security issue. If something absolutely must be added mid-sprint, something else comes out. It's a trade, not an addition. I make the tradeoff visible to the PM so it's a conscious decision, not a quiet overload. If scope creep happens frequently, I bring it up in retro with data — "3 out of the last 5 sprints had significant scope changes. Here's the impact on delivery."

#### How do you estimate work when requirements are unclear?

Unclear requirements are the single most common source of bad estimates. I estimate what I know and flag the unknown parts separately. I use ranges instead of single numbers — "This is 3-5 points. 3 if the API follows the same pattern we've used before, 5 if it requires custom authentication."

I ask clarifying questions during grooming — "Does this need offline support? Does the error state need a retry?" These sound like small questions, but they can double an estimate. If the story is still too unclear after grooming, I create a time-boxed spike — spend a day or two investigating, then come back with a real estimate instead of a guess.

#### What's your approach to working with designers?

I review designs early and give feedback during the design phase, not after handoff. Telling a designer "This animation will be difficult on low-end devices" is useful during design. Saying the same thing during implementation is frustrating for everyone. I ask about edge cases upfront — empty states, error states, loading states, long text, different screen sizes. Designers appreciate it because it catches gaps before they become bugs.

When something is technically expensive, I propose alternatives — "This parallax effect would cause jank on most devices. Can we use a simple fade transition instead?" But if I agreed to implement a design, I implement it accurately. I don't silently adjust spacing or change behavior because the original was harder. That's a trust killer.

### Common Follow-ups

- How do you handle a sprint where the team delivers significantly fewer points than estimated?
- What do you do when daily standups become unproductive?
- How do you onboard a new team member into your Agile process?
- Tell me about a retrospective action item that actually improved your team's process.
- How do you handle a situation where the PM and the designer disagree on a feature?
- What's the difference between Scrum and Kanban? When would you choose one over the other?
- How do you handle technical debt in a sprint-driven environment?
