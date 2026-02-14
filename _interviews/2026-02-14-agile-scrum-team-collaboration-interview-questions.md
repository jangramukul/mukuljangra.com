---
title: "Agile, Scrum & Team Collaboration"
date: 2026-02-14
layout: interview
tags: [Behavioral Round]
order: 3
---

## Agile, Scrum & Team Collaboration

Many companies ask about how you work within Agile teams. They want to know you understand the process and can collaborate effectively across functions.

### Core Questions (Beginner → Intermediate)

#### Q1: What is Agile and why do teams use it?

Agile is a way to build software through iterative development cycles. Instead of planning everything upfront and delivering once at the end, you deliver in small increments, get feedback, and adjust. The core idea is that requirements change, so your process should be built to handle change.

Teams use Agile because it reduces the risk of building the wrong thing. You ship small pieces frequently, users give feedback, and you course-correct. It also brings more accountability to the team — everyone knows what's being worked on and what's due.

#### Q2: What is Scrum and how does it differ from Agile?

Agile is the philosophy. Scrum is one specific framework for practicing Agile. Other frameworks include Kanban, Lean, and Extreme Programming.

Scrum provides a structured cycle — sprints (typically 2 weeks), defined roles (Product Owner, Scrum Master, Team), and specific ceremonies (standup, planning, review, retro). Not every Agile team does Scrum, but most use some version of it.

#### Q3: What happens in each Scrum ceremony?

- **Sprint Planning** — The team selects work from the backlog for the upcoming sprint. You discuss scope, break stories into tasks, estimate effort, and commit to what you can deliver in the sprint timeframe. Usually 1-2 hours for a 2-week sprint.
- **Daily Standup** — A 15-minute daily sync. Each person covers what they did yesterday, what they're doing today, and if anything is blocking them. It's a status check, not a problem-solving meeting.
- **Sprint Review** — At the end of the sprint, the team demos what was built to stakeholders. This is where you get feedback from PMs, designers, and sometimes users.
- **Sprint Retrospective** — The team reflects on the sprint itself — what went well, what didn't, what can be improved. This is about the process, not the product. It's the most important ceremony for continuous improvement.

#### Q4: What are story points and how do you estimate work?

Story points measure the relative effort of a task, not time. A 5-point story is roughly 2.5x the effort of a 2-point story. The most common scale is Fibonacci — 1, 2, 3, 5, 8, 13.

Teams estimate using planning poker — everyone picks a number independently, then discusses if there's disagreement. The discussion matters more than the number. If one person says 2 and another says 8, the 8-person likely sees complexity the others missed.

Story points are useful because they normalize for different skill levels. A senior engineer might finish a 5-point story in 2 hours while a junior takes a full day, but the effort and complexity are the same.

#### Q5: What is sprint velocity and how is it used?

Velocity is the average number of story points a team completes per sprint, measured over 3-5 sprints. If the team consistently delivers 30-35 points per sprint, that's the velocity.

It's used for planning — if the team's velocity is 30, don't commit to 50 points of work in a sprint. It's also a trend indicator — a consistently dropping velocity might signal burnout, unclear requirements, or too much context switching.

Velocity is not a performance metric. Comparing velocities between teams is meaningless because each team calibrates points differently. A team doing 20 points might be delivering more value than a team doing 50.

#### Q6: What is the Definition of Done?

The Definition of Done (DoD) is a shared agreement of what "done" means for a task or story. Without it, "done" means different things to different people — one engineer thinks done means code is written, another thinks it means tested and deployed.

A typical DoD includes:
- Code is written and follows team standards
- Unit tests are written and passing
- Code review is approved
- Feature is tested on the staging environment
- Documentation is updated if needed

The DoD prevents the "it works on my machine" problem. A story isn't done until it meets every item on the list.

#### Q7: How do you give effective feedback in code reviews?

Code reviews are about improving the code and helping your teammates grow, not proving you know more.

**Good code review practices:**
- Be specific — "This function does three things. Consider extracting the validation into a separate function" is better than "This is too complex"
- Explain the why — don't just say "use `sealed class` here." Explain why sealed classes are better for this case
- Distinguish between must-fix and nice-to-have — prefix suggestions with "nit:" or "suggestion:" so the author knows what's blocking and what's optional
- Ask questions when unsure — "Is there a reason this is a `var` instead of `val`?" opens a conversation instead of assuming the author made a mistake
- Acknowledge good work — if a solution is clever or well-structured, say so. Reviews shouldn't be only negative

The goal is that the author learns something from every review, and the codebase gets better with every PR.

#### Q8: How do you receive feedback on your own code?

Receiving feedback well is just as important as giving it. Don't take it personally — the reviewer is commenting on the code, not on you.

**Good approach:**
- Read the feedback carefully before responding. Don't fire back immediately
- If you disagree, explain your reasoning — "I used a `var` here because the value changes during the animation. I could make it a `val` by restructuring, but it adds complexity"
- If the feedback is right, just fix it and thank them. No need to explain or justify
- If you don't understand the feedback, ask — "Can you explain what you mean by this? I want to understand the concern"
- Don't approve your own shortcuts — if a reviewer catches something you knowingly skipped, own it

The best engineers I've worked with treat code reviews as a learning opportunity, not an audit.

### Deep Dive Questions (Advanced → Expert)

#### Q9: How do you collaborate with product managers who don't have technical context?

This is common in cross-functional teams. The PM thinks in user stories and business metrics. You think in architecture and implementation complexity. The gap needs bridging.

**Framework:**
- Translate technical constraints into business impact — "Adding offline support requires a local database and sync logic. That's 2 sprints instead of 1, but it means users won't lose data on subway commutes"
- Don't just say "it's hard" — explain what makes it hard and what the alternatives are
- Propose phased delivery — "We can ship the basic version in sprint 1 and add the advanced features in sprint 2. Users get value early"
- Be proactive with estimates — if a story looks bigger than expected during grooming, flag it immediately. Don't wait until mid-sprint to say you're behind

The best engineer-PM relationships are built on trust. The PM trusts your estimates because you're honest about complexity. You trust their priorities because they explain the business reasoning.

#### Q10: How do you handle a blocker that's outside your control?

Blockers happen — waiting on a backend API, a design that isn't ready, a dependency on another team. The worst thing you can do is sit idle.

**Framework:**
- Raise it immediately — mention it in standup, message the relevant person, escalate to your manager if needed. Don't wait for someone to notice
- Work around it if possible — if the API isn't ready, mock it and build against the contract. If the design isn't final, use placeholder UI and implement the logic
- Switch tasks — if the blocker can't be worked around, pick up another story from the sprint backlog. Don't just wait
- Follow up — if you raised a blocker and got no response in 24 hours, follow up again. Being persistent about blockers is not being annoying — it's being responsible

Document blockers and their resolution times. If the same type of blocker keeps recurring, bring it up in retro.

#### Q11: How does your team handle knowledge sharing?

Knowledge silos are a risk. If only one person understands the payment module, the team is fragile. Companies want to hear that you actively share knowledge.

**Practices to mention:**
- Pair programming on complex features — the knowledge lives in two heads instead of one
- Architecture Decision Records (ADRs) — short documents explaining what was decided and why. Future developers can understand the reasoning without asking
- Code walkthroughs — after a large feature ships, walk the team through the implementation in 30 minutes
- Rotating code reviews — don't always review the same person's code. Review areas you're less familiar with to learn them
- Documentation — keep the README, setup guides, and architecture docs current. Not detailed prose, just enough for a new person to get started

The goal is that any team member can pick up any area of the codebase within a day or two, not a month.

#### Q12: How do you work effectively in a remote or distributed team?

Remote work requires deliberate communication. You can't rely on hallway conversations or reading body language.

**Practices that work:**
- Over-communicate in writing — document decisions, share context in PRs, write clear commit messages. When in doubt, write it down
- Use async communication well — don't schedule a meeting when a Slack message or a short Loom video works
- Be responsive — acknowledge messages even if you can't answer immediately. "Saw this, will look at it after lunch" goes a long way
- Regular 1-on-1s with key collaborators — a 15-minute weekly sync with the PM, the designer, or a cross-team dependency prevents misalignment
- Camera on during important meetings — standups and retros benefit from seeing faces. Not every meeting needs it, but relationship-building does

The biggest remote challenge is isolation. Make an effort to be visible — share what you're working on, celebrate team wins, and participate in discussions beyond your immediate tasks.

#### Q13: What makes a good sprint retrospective?

A retro that doesn't lead to action items is a waste of time. The purpose is to identify one or two concrete improvements the team commits to for the next sprint.

**Good retro structure:**
- What went well — celebrate wins and acknowledge good practices. This keeps morale up
- What didn't go well — be honest about problems without blaming individuals. "We had 3 scope changes mid-sprint" not "PM kept changing requirements"
- Action items — pick 1-2 improvements and assign owners. "Next sprint, we'll lock scope after day 2. Scrum Master will enforce this." If you pick 5 improvements, none of them happen
- Follow up — check last sprint's action items at the start of each retro. Did we actually do what we said we'd do?

The worst retro pattern is listing problems every sprint without ever fixing them. If the same issue shows up three retros in a row, escalate it.

#### Q14: How do you handle scope creep during a sprint?

Scope creep is when new work gets added to a sprint after planning. Some amount is inevitable, but unchecked scope creep means the team never delivers what it committed to.

**Framework:**
- New work goes to the backlog by default — unless it's a critical production bug or a security issue, it waits for the next sprint
- If something must be added mid-sprint, something else comes out — you can't just add work without removing work. Make the tradeoff visible to the PM
- Protect the team's commitment — the Scrum Master or tech lead should push back on mid-sprint additions. "We committed to these 8 stories. Adding this story means we likely drop one of the others"
- Track it — if scope creep happens frequently, bring it up in retro with data. "3 out of the last 5 sprints had significant scope changes. Here's the impact on our delivery"

The goal isn't zero change. It's making change a conscious decision with understood tradeoffs.

#### Q15: How do you collaborate with QA?

QA is not the team that "finds your bugs." QA is a partner in quality. The best teams have a collaborative relationship between engineering and QA.

**Good practices:**
- Involve QA early — share designs and requirements with QA during grooming, not after you've finished coding. They'll catch edge cases you missed before you write a single line
- Write testable code — if QA can't test a feature because there's no way to set up the right state, that's an engineering problem
- Share test cases — QA writes test plans, but you should read them. If their test cases don't cover something you know is tricky, flag it
- Don't throw it over the wall — "QA will catch it" is not a testing strategy. Write your own unit and integration tests. QA should focus on end-to-end scenarios and exploratory testing
- Fix bugs quickly — when QA reports a bug, prioritize it. Leaving bugs in the queue for days slows everyone down

#### Q16: How do you estimate work when requirements are unclear?

Unclear requirements are the most common source of bad estimates. The answer isn't to refuse to estimate — it's to estimate with explicit assumptions.

**Framework:**
- Estimate what you know — break the story into the parts you understand and estimate those. Flag the unknown parts separately
- Use ranges instead of single numbers — "This is 3-5 points. It's 3 if the API follows the same pattern as our other endpoints, 5 if it requires custom authentication"
- Ask clarifying questions during grooming — don't estimate in silence. "Does this need offline support? Does the error state need a retry button?" These questions change the estimate significantly
- Add a spike if needed — if the story is too unclear to estimate, create a time-boxed spike (4 hours, 1 day) to investigate. Then estimate based on findings

Bad estimates usually come from estimating what you hope the work is, not what it actually is.

#### Q17: What's your approach to working with designers?

Designers and engineers see the product from different angles. Designers care about the experience, engineers care about feasibility and performance. Good collaboration happens when both perspectives are respected.

**Practices:**
- Review designs early — give feedback during the design phase, not after handoff. "This animation will be difficult on low-end devices" is useful during design, frustrating during implementation
- Ask about edge cases — designs often show the happy path. Ask about empty states, error states, loading states, long text, and different screen sizes. Good designers appreciate the thoroughness
- Propose alternatives when something is expensive — "This parallax effect would cause jank on most devices. Can we achieve a similar feel with a simple fade transition?"
- Be faithful to the design — if you agreed to implement something, implement it accurately. Don't silently change spacing, colors, or behavior because it's easier. If you need to deviate, discuss it

The goal is shipping a product that looks and feels right to the user while being technically sound.

### Common Follow-ups

- How do you handle a sprint where the team delivers significantly fewer points than estimated?
- What do you do when daily standups become unproductive?
- How do you onboard a new team member into your Agile process?
- Tell me about a retrospective action item that actually improved your team's process.
- How do you handle a situation where the PM and the designer disagree on a feature?
- What's the difference between Scrum and Kanban? When would you choose one over the other?
- How do you handle technical debt in a sprint-driven environment?
