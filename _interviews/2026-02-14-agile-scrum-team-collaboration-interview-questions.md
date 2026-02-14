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

Agile and Scrum questions come up in almost every behavioral round. Interviewers want to know you can work within a structured development process and collaborate across functions.

#### What is Agile and why do teams use it?

Agile is a way to build software through short, iterative cycles. Instead of planning everything upfront and delivering once at the end, I deliver in small increments, get feedback, and adjust. Requirements change, so the process should handle change.

Teams use Agile because it reduces the risk of building the wrong thing. I ship small pieces frequently, users give feedback, and I course-correct. It also brings more accountability — everyone knows what's being worked on and what's due.

#### What is Scrum and how does it differ from Agile?

Agile is the philosophy. Scrum is one specific framework for practicing Agile. Other frameworks include Kanban, Lean, and Extreme Programming.

Scrum gives you a structured cycle — sprints (typically 2 weeks), defined roles (Product Owner, Scrum Master, Team), and ceremonies (standup, planning, review, retro). Not every Agile team does Scrum, but most use some version of it.

#### What happens in each Scrum ceremony?

- **Sprint Planning** — The team selects work from the backlog for the upcoming sprint. I discuss scope, break stories into tasks, estimate effort, and commit to what I can deliver. Usually 1-2 hours for a 2-week sprint.
- **Daily Standup** — A 15-minute daily sync. Each person covers what they did yesterday, what they're doing today, and any blockers. It's a status check, not a problem-solving meeting.
- **Sprint Review** — At the end of the sprint, the team demos what was built to stakeholders. This is where I get feedback from PMs, designers, and sometimes users.
- **Sprint Retrospective** — The team reflects on the sprint — what went well, what didn't, what can be improved. This is about the process, not the product.

#### What are story points and how do you estimate work?

Story points measure relative effort, not time. A 5-point story is roughly 2.5x the effort of a 2-point story. The common scale is Fibonacci — 1, 2, 3, 5, 8, 13.

I estimate using planning poker — everyone picks a number independently, then discusses disagreements. The discussion matters more than the number. If one person says 2 and another says 8, the 8-person likely sees complexity the others missed. Story points normalize for skill levels — a senior might finish a 5-point story in 2 hours while a junior takes a day, but the complexity is the same.

#### What is sprint velocity and how is it used?

Velocity is the average number of story points a team completes per sprint, measured over 3-5 sprints. If the team consistently delivers 30-35 points, that's the velocity.

I use it for planning — if velocity is 30, I don't commit to 50 points. It's also a trend indicator — dropping velocity might signal burnout, unclear requirements, or too much context switching. Velocity is not a performance metric. Comparing velocities between teams is meaningless because each team calibrates points differently.

#### What is the Definition of Done?

The Definition of Done is a shared agreement of what "done" means for a story. Without it, "done" means different things to different people — one engineer thinks done means code is written, another thinks it means tested and deployed.

A typical DoD includes:
- Code is written and follows team standards
- Unit tests are written and passing
- Code review is approved
- Feature is tested on staging
- Documentation is updated if needed

A story isn't done until it meets every item on the list.

#### How do you give effective feedback in code reviews?

I focus on being specific and explaining the why. "This function does three things — consider extracting the validation" is better than "this is too complex." I distinguish between must-fix and nice-to-have by prefixing suggestions with "nit:" so the author knows what's blocking and what's optional.

When I'm unsure, I ask questions — "Is there a reason this is a `var` instead of `val`?" opens a conversation instead of assuming a mistake. I also acknowledge good work. Reviews shouldn't be only negative.

#### How do you receive feedback on your own code?

I read feedback carefully before responding. If I disagree, I explain my reasoning — "I used a `var` here because the value changes during the animation. I could restructure, but it adds complexity." If the feedback is right, I fix it and move on. No need to justify.

If I don't understand the feedback, I ask. And if a reviewer catches something I knowingly skipped, I own it.

#### How do you collaborate with product managers who don't have technical context?

The PM thinks in user stories and business metrics. I think in architecture and implementation complexity. The gap needs bridging.

I translate technical constraints into business impact — "Adding offline support requires a local database and sync logic. That's 2 sprints instead of 1, but users won't lose data on subway commutes." I don't just say "it's hard" — I explain what makes it hard and what the alternatives are. If a story looks bigger than expected during grooming, I flag it immediately. I don't wait until mid-sprint.

#### How do you handle a blocker that's outside your control?

Blockers happen — waiting on a backend API, a design that isn't ready, a dependency on another team. I raise it immediately in standup and message the relevant person. If I get no response in 24 hours, I follow up again.

If I can work around it, I do — mock the API and build against the contract, or use placeholder UI and implement the logic. If I can't work around it, I pick up another story from the backlog. Sitting idle is the worst option.

#### How does your team handle knowledge sharing?

Knowledge silos are a risk. If only one person understands a module, the team is fragile. I handle this through pair programming on complex features, rotating code reviews so I review areas I'm less familiar with, and doing code walkthroughs after large features ship.

I also keep documentation current — not detailed prose, just enough for a new person to get started. The goal is that any team member can pick up any area of the codebase within a day or two.

#### How do you work effectively in a remote or distributed team?

Remote work requires deliberate communication. I over-communicate in writing — document decisions, share context in PRs, write clear commit messages. I use async communication well — a Slack message or a short video often works better than a meeting.

I stay responsive — even a quick "Saw this, will look after lunch" goes a long way. Regular 1-on-1s with the PM, designer, or cross-team dependencies prevent misalignment.

#### What makes a good sprint retrospective?

A retro that doesn't lead to action items is a waste of time. The purpose is to identify one or two concrete improvements the team commits to for the next sprint.

I follow a simple structure — what went well, what didn't, and action items. I keep action items to 1-2 with assigned owners. If I pick 5 improvements, none of them happen. At the start of each retro, I check last sprint's action items to see if we actually did what we said. If the same issue shows up three retros in a row, I escalate it.

#### How do you handle scope creep during a sprint?

Scope creep is when new work gets added after planning. Some amount is inevitable, but unchecked scope creep means the team never delivers what it committed to.

My approach — new work goes to the backlog by default unless it's a critical bug or security issue. If something must be added mid-sprint, something else comes out. I make the tradeoff visible to the PM. If scope creep happens frequently, I bring it up in retro with data — "3 out of the last 5 sprints had significant scope changes. Here's the impact on delivery."

#### How do you estimate work when requirements are unclear?

Unclear requirements are the most common source of bad estimates. I estimate what I know and flag the unknown parts separately. I use ranges instead of single numbers — "This is 3-5 points. 3 if the API follows the same pattern, 5 if it requires custom authentication."

I ask clarifying questions during grooming — "Does this need offline support? Does the error state need a retry?" These questions change the estimate significantly. If the story is too unclear, I create a time-boxed spike to investigate first.

#### What's your approach to working with designers?

I review designs early and give feedback during the design phase, not after handoff. "This animation will be difficult on low-end devices" is useful during design, frustrating during implementation. I ask about edge cases — empty states, error states, loading states, long text, different screen sizes.

When something is expensive, I propose alternatives — "This parallax effect would cause jank on most devices. Can we use a simple fade transition instead?" But if I agreed to implement a design, I implement it accurately. I don't silently change spacing or behavior because it's easier.

### Common Follow-ups

- How do you handle a sprint where the team delivers significantly fewer points than estimated?
- What do you do when daily standups become unproductive?
- How do you onboard a new team member into your Agile process?
- Tell me about a retrospective action item that actually improved your team's process.
- How do you handle a situation where the PM and the designer disagree on a feature?
- What's the difference between Scrum and Kanban? When would you choose one over the other?
- How do you handle technical debt in a sprint-driven environment?
