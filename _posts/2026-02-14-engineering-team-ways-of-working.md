---
title: The Complete Guide to Working in an Engineering Team
layout: post
categories: post
tags:
  - Android
  - Best Practices
  - Architecture
---

When I started my first job as an Android engineer, I thought the hard part was writing code. I knew Kotlin, I understood Activities and Fragments, and I could build features. Turns out, that was the easy part.

The hard part? Figuring out how to actually work with other humans. How to write a PR description that doesn't make reviewers want to cry. How to ask for help without feeling like an impostor. How to communicate when I was stuck instead of silently struggling for three days on something a teammate could have helped me solve in twenty minutes. Nobody warned me about any of this.

Here's the thing — university teaches you algorithms and data structures. Tutorials teach you how to use libraries. But nobody sits you down and explains how an engineering team actually operates day to day. And this is the part that makes or breaks your career. I've seen brilliant engineers fail because they couldn't collaborate, and I've seen average engineers thrive because they communicated well, shipped consistently, and made everyone around them more productive. Google's own research (Project Aristotle) confirmed this — the number one factor in high-performing teams isn't individual talent. It's psychological safety. The ability to take risks, ask questions, and admit mistakes without fear of judgment.

Think of it like a sports team. You can have the most talented individual players in the league, but if they don't know how to pass the ball, read each other's moves, and communicate on the field, they'll lose to a well-coordinated team of "average" players every single time. Engineering teams work the same way.

This post is everything I wish someone had told me on my first day. It covers how engineering teams are structured, how work flows from idea to production, how to communicate effectively, how to write pull requests that get reviewed quickly, how to handle code review without ego, how to run sprints, how to deal with being stuck, and how to grow from a junior engineer into someone the team relies on. It's long. I meant it to be. Bookmark it and come back when you need a specific section.

## How Engineering Teams Are Structured

Imagine a restaurant. You've got the chef deciding the menu, a sous chef running the kitchen, line cooks preparing dishes, and a manager making sure customers are happy and the staff gets paid. Each person has a clear role, and the restaurant only works when everyone knows their job and who to talk to about what.

Engineering teams work the same way. Most follow some variation of a **squad model** — a small, cross-functional team of typically 4 to 8 engineers that owns a specific area of the product. You'll usually have a mix of Android engineers, iOS engineers, backend engineers, a product manager (PM), a designer, and a QA engineer. The exact composition varies by company, but the principle is the same: a squad has everything it needs to ship features independently without waiting on other teams. It's a self-contained kitchen, not a giant cafeteria assembly line.

Within the squad, you'll encounter a few key roles. The **Product Manager** defines what to build and why — they're the person who talks to customers and translates "users are frustrated" into actual feature requirements. The **Tech Lead** (or Principal Engineer) makes architectural decisions and sets technical direction — they're the person who's seen this codebase evolve and knows where the skeletons are buried. The **Engineering Manager** handles people — career growth, 1:1s, hiring, performance reviews. In some companies, the EM and Tech Lead are the same person. The **QA Engineer** tests your work before it reaches users. The **Scrum Master** (or Agile Coach) runs ceremonies and removes blockers.

Why does knowing these roles matter? Because talking to the wrong person wastes everyone's time. Got a question about what a feature should do? Ask the PM. Confused about the architecture of a module? Ask the Tech Lead. Need to discuss your career growth? Talk to your EM. Going to your EM with architecture questions is like asking the restaurant manager how to julienne carrots — they'll try to help, but the chef is right there.

Beyond your squad, larger organizations have **chapters** (or guilds) — groups of engineers with the same specialty (all Android engineers, for example) across different squads. Chapters share knowledge, maintain coding standards, and ensure consistency across the product. If your squad's Android app handles navigation differently from another squad's, the Android chapter is where that gets resolved. Spotify pioneered this model publicly, and many companies have adapted it since.

## How Work Flows: From Idea to Production

Understanding the flow of work is fundamental. Think of it like a relay race — the baton passes through many hands before it crosses the finish line, and if anyone drops it, the whole race suffers. Here's how a feature typically moves through an engineering team:

**1. Product defines the problem.** The PM writes a product requirement document (PRD) or a brief that explains what the user needs, why it matters, and what success looks like. Good PMs include acceptance criteria — specific conditions that must be true for the feature to be considered done. If you get a vague brief, ask for acceptance criteria before you start writing code. "Build a search feature" is not a specification — that's like telling a chef to "make food." But "Search should support minimum 3-character queries, show results within 500ms, display up to 20 results, and show an empty state when no results match" — now you know exactly what to cook and how to know when it's done.

**2. Design creates the experience.** The designer produces mockups, user flows, and sometimes interactive prototypes. As an engineer, review these early. Don't wait until the design is "final" to raise technical concerns. If a design requires an API that doesn't exist, or if an animation would tank performance on low-end devices, say so now. The cost of changing a Figma file is near zero. The cost of rewriting a feature after three weeks of implementation? Enormous. It's the difference between erasing a pencil sketch and demolishing a finished wall.

**3. Engineering breaks it down.** This is where you come in. The Tech Lead (or the squad collectively) breaks the feature into technical tasks. Each task becomes a ticket — a Jira ticket, a Linear issue, a GitHub issue, whatever your team uses. Good tickets are small, specific, and independently shippable. "Implement search" is a bad ticket. "Add search text field with debounce" and "Implement search API repository" and "Build search results LazyColumn" — those are good tickets. A good rule of thumb: each ticket should be completable in 1-3 days. If it's bigger than that, break it down further.

**4. Sprint planning.** The team picks which tickets to work on in the upcoming sprint (usually a 1-2 week cycle). Engineers estimate effort (story points, t-shirt sizes, or just time estimates — the format varies). The key here: be honest about estimates. Padding estimates to look safe is just as bad as underestimating to look fast. Over time, your estimates will get more accurate as you learn the codebase and your own pace.

**5. Implementation.** You pick a ticket, create a branch, write code, write tests, and raise a pull request. More on this process below.

**6. Code review.** Teammates review your PR. You address feedback, iterate, and merge.

**7. QA testing.** The QA engineer tests the feature against the acceptance criteria. They'll file bugs if anything is wrong. Fix them.

**8. Release.** The feature ships to users, either through a regular release cycle or a feature flag. Monitor crash reports and user feedback.

This flow isn't always linear — real life is messier than a numbered list. You'll often be doing steps 5-8 for multiple tickets simultaneously while step 4 is happening for the next sprint. The key is understanding where your work fits in the bigger picture.

## Day-to-Day Communication

Communication is where most engineers underperform, not because they lack skills, but because nobody taught them the norms. And I get it — you became an engineer because you like solving problems with code, not because you love writing Slack messages. But here's the uncomfortable truth: your code doesn't matter if nobody understands what you're building or why.

### Async-First Communication

GitHub's engineering team published their internal communication guide publicly (github/how-engineering-communicates), and their number one principle is **"be asynchronous first."** Asynchronous communication means you send a message and the other person responds when they can — no expectation of an immediate reply. This is the opposite of tapping someone on the shoulder or sending "hey, got a sec?" on Slack.

Why async-first? Think about it this way. You're deep in a gnarly bug — you've got the stack trace in your head, you're three layers deep in the debugger, you're *this close* to figuring it out... and someone pings you on Slack. "Quick question." Just like that, the entire mental model you spent 30 minutes building evaporates. You answer their question in two minutes, but it takes you another 15 minutes to get back to where you were. Research confirms this — every interruption costs 10-15 minutes of context-switching time. Multiply that across a team, and you lose hours of productivity daily.

In practice, async-first means:

- **Write your full question in one message.** Don't send "hey" and wait. Don't send "can I ask you something?" Include the context, what you've tried, and what you need. The recipient should be able to help you without a back-and-forth.
- **Use channels, not DMs.** Post questions in public Slack channels (or Teams, or whatever your company uses). Others might have the same question, and the answer becomes searchable. DMs are black holes — when you leave the company, that knowledge leaves with you.
- **Don't expect immediate responses.** Unless something is on fire in production, give people time. Aim to respond to non-urgent messages within one business day.
- **Use `@here` and `@channel` sparingly.** These are the equivalent of shouting in a crowded room. Reserve them for genuinely urgent situations.

### Writing Things Down

The second principle from GitHub's guide: **"write things down."** Especially the "why" behind decisions. When you make a technical decision — choosing Room over SQLDelight, or picking MVI over MVVM for a new module — write down why. Not just the what.

Here's why this matters so much. A year from now, someone (possibly you) will look at that code and wonder why it was done that way. If the reasoning is documented, they can build on it. If it's not, they might undo your work without understanding the context. It's like leaving a note for future-you that says "Don't touch this — it's weird on purpose, and here's why."

Google calls this the "Chesterton's Fence" principle — from the book "Software Engineering at Google" — before removing or changing something, first understand why it's there. Documentation makes this possible.

Where to write things down:

- **PR descriptions** — Explain what the PR does and why. Not just "fix bug." What bug? What caused it? How did you fix it? What other approaches did you consider?
- **Architecture Decision Records (ADRs)** — Short documents that capture significant technical decisions. "We chose X over Y because of Z." Store these in your repo so they're versioned alongside your code.
- **Jira/Linear comments** — When requirements change or you discover something unexpected during implementation, document it on the ticket. Future you will thank present you.
- **README files** — Every module should have a README that explains what it does, how to set it up, and any quirks or gotchas.

> **🧠 Think about it:** When was the last time you made a technical decision and wrote down *why* you chose that approach? If the answer is "never" or "I can't remember," you're building a codebase full of fences that nobody understands.

### Stand-ups

The daily standup (or daily scrum) is a short meeting — ideally 10-15 minutes — where each team member shares three things: what they did yesterday, what they're doing today, and whether anything is blocking them. The purpose is coordination, not status reporting. You're not reporting to your manager like a student telling a teacher what homework they did. You're synchronizing with your teammates so that everyone knows what's happening and can offer help or flag conflicts.

Common standup mistakes:

- **Turning it into a status report.** "I worked on the search feature" tells your team nothing actionable. Compare that with: "I finished the search API integration, and today I'm building the results UI. I'm blocked on the design for the empty state — the mockup doesn't cover it." See the difference? The second version gives your PM a clear action item, and your teammates know not to pick up search-related tickets because you're already on it.
- **Going too deep.** Standup isn't the place to debug a problem together. If something needs discussion, say "I need to talk to Lee about the caching strategy after standup" and move on. Save the deep dives for after.
- **Hiding blockers.** If you're stuck, say so. I used to struggle silently for days because I didn't want to look incompetent. But being stuck for three days and not telling anyone isn't a sign of competence — it's a sign of poor communication. Your team can't help you if they don't know you need help. It's like sitting in a broken-down car on the side of the road and refusing to call for a tow truck because you don't want to admit you can't fix it yourself.

### When to Escalate

Not everything can be resolved asynchronously. GitHub's guide recommends treating meetings as a "point of escalation" — you start with async (a Slack message, a ticket comment, a PR review), and if you can't resolve it there, you escalate to a synchronous call. If a PR review goes back and forth for more than 3-4 rounds without consensus, jump on a 15-minute call. You'll resolve it faster, and you'll avoid the frustration of misinterpreted text.

The escalation ladder looks like this: **ticket comment → Slack message → quick call → scheduled meeting → bring in the Tech Lead.** Most issues resolve at the first or second level. If you're regularly escalating to meetings, something is wrong with your team's written communication.

## How to Handle Being Stuck

Every engineer gets stuck. Every. Single. One. The difference between a junior and a senior isn't that seniors never get stuck — it's that they get unstuck faster because they have better strategies. Here's my framework:

**1. Define the problem clearly.** Before asking anyone for help, write down exactly what you're trying to do, what you expected to happen, what's actually happening, and what you've already tried. Half the time, the act of writing this down helps you find the answer yourself. This is rubber duck debugging — and yeah, it sounds silly, but it works because it forces your brain to organize the chaos into words. You can't explain a problem you don't understand.

**2. Time-box your solo debugging.** Give yourself 30-60 minutes. If you can't figure it out in that time, stop and ask for help. The old advice of "try harder" is wrong. Struggling silently for a full day is not impressive — it's wasteful. Imagine a hiker who's been walking in circles for six hours but refuses to check the map because they want to "figure it out themselves." That's what spending a full day stuck looks like to your team.

**3. Search before asking.** Check the codebase for similar implementations. Search Slack history. Check the official documentation. Search your team's ADRs and wiki.

**4. Ask smart questions.** When you do ask, provide context. "This doesn't work" is a useless question. "I'm trying to observe a StateFlow from the repository in my ViewModel, but `collectAsStateWithLifecycle` is recomposing on every emission even when the value hasn't changed. Here's my code [link]. I've verified the Flow is emitting distinct values with a log. I suspect the issue is that my data class doesn't implement equals correctly, but I'm not sure. Can someone take a look?" — that's a great question. It shows effort, provides context, and even includes a hypothesis. The person helping you can jump straight to the actual problem instead of spending ten minutes extracting basic information from you.

**5. Share your solution.** When you figure it out — whether alone or with help — share the solution in the channel where you asked. This builds a searchable knowledge base for the team. Someone will hit the same wall six months from now, and your posted solution will save them hours.

## Pull Requests: The Core of Team Engineering

Pull requests are where individual work becomes team work. A PR is not just a code delivery mechanism — it's a communication artifact, a knowledge-sharing tool, and a quality gate all in one. Think of a PR like submitting a draft of a book chapter to your editor. The code is the draft, the description is your cover letter explaining what changed and why, and the review is the editorial process that catches mistakes and improves clarity. Google's engineering practices guide emphasizes that "the primary purpose of code review is to make sure that the overall code health of the codebase is improving over time." Here's how to do PRs well.

### Writing Good PRs

**Keep them small.** The single biggest factor in PR quality is size. This might be the most important thing I say in this entire section, so I'll say it plainly: small PRs get fast, high-quality reviews. Large PRs get slow, low-quality reviews. Google's eng-practices guide has an entire page on "Small CLs" (their term for changesets). A PR with 50-100 lines of changes gets reviewed in minutes and gets thoughtful feedback. A PR with 800 lines sits in the queue for days, gets rubber-stamped with a "LGTM" from a reviewer who skimmed it, and bugs sneak through because nobody has the stamina to carefully read 800 lines of code.

If your feature requires 800 lines, break it into multiple PRs. Ship the data layer first (models, repository, data source). Then the domain layer (use cases if you have them). Then the UI. Each PR is independently reviewable and independently testable. It's like eating a meal one course at a time instead of trying to swallow the entire dinner in one bite.

**Write descriptive titles and descriptions.** Google's guide says a CL description should answer two questions: what change is being made, and why. The title should be a short summary that stands alone — someone scanning the git history should understand what this PR did without opening it. "Fix bug" is never an acceptable title. "Fix crash when search query is empty on API 28 devices" is.

The description should include:

- What the PR does (summary)
- Why the change is needed (context, ticket link)
- How you implemented it (approach, especially if there were alternatives)
- Screenshots or recordings for UI changes
- Testing notes (what you tested manually, what automated tests cover)

**Link to the ticket.** Always. Every PR should reference the Jira/Linear ticket it addresses. This creates a bidirectional trail — from ticket to code and from code to ticket.

**Self-review before requesting review.** Read your own diff. I catch 20-30% of my mistakes this way. Look for: leftover debug logs, TODOs you forgot to address, hardcoded strings that should be resources, missing null checks, functions that are too long, naming inconsistencies. It takes five minutes and saves your reviewer from pointing out things you should have caught yourself.

> **⚡ Quick check:** Before you hit "Request Review" on your next PR, can you answer these three questions: What does this PR do? Why is this change needed? What did you test? If you can't answer all three clearly, your PR description needs work.

### Reviewing Others' PRs

Code review is a skill. It's not about finding every possible improvement — it's about ensuring the PR improves the overall health of the codebase.

**Review promptly.** Google's standard is to respond to a code review request within one business day. Ideally, within a few hours. Slow reviews block your teammates and kill team velocity. If you can't review it today, say so — "I'm heads-down on the search feature today, I'll review this tomorrow morning." That one sentence is infinitely better than silence.

**Focus on what matters.** Don't leave 30 comments about formatting when there's a concurrency bug in the ViewModel. Prioritize: correctness first, then design, then readability, then style. If something is a minor preference rather than a real issue, prefix it with "nit:" to signal it's not a blocker.

**Be constructive, not adversarial.** "This is wrong" is not helpful. "I think there might be a race condition here because the StateFlow could emit before the coroutine scope is active. What if we used `SharingStarted.WhileSubscribed(5000)` instead?" — that's constructive. You're explaining the problem, showing you understand the code, and offering a specific alternative. The difference between a helpful review and a hostile one often comes down to tone and specificity.

Google's reviewer guide has a principle I love: **"In general, reviewers should favor approving a PR once it is in a state where it definitely improves the overall code health of the system, even if the PR isn't perfect."** There is no such thing as perfect code — there is only better code. Don't hold up a PR for days over style preferences.

**Don't take it personally.** And don't make it personal. You are not your code. When someone suggests a change, they're improving the codebase, not attacking your competence. If you disagree with feedback, explain your reasoning. Have a technical discussion. But don't dig in your heels because of ego — be open to influence. Google's "Software Engineering at Google" book puts it this way: "The more open you are to influence, the more you are able to influence."

## Running Sprints and Agile Ceremonies

Most engineering teams use some form of Agile, usually Scrum or Kanban. Now, I know — "Agile" has become one of those words that makes experienced engineers roll their eyes. But strip away the corporate jargon and the certification industry, and what you're left with is genuinely useful: short cycles, regular feedback, and a willingness to adapt. Here's what actually matters in practice.

### Sprint Planning

Happens at the start of each sprint (1-2 weeks). The team looks at the prioritized backlog and commits to a set of tickets. Key principles:

- **Don't overcommit.** It's better to finish everything you committed to than to start 10 things and finish 5. Consistent delivery builds trust with your PM and stakeholders. It's like packing for a trip — take what you can carry, not everything you might want.
- **Factor in unknowns.** Leave buffer for bugs, production incidents, code review time, and the inevitable meetings that eat into your coding hours. I usually assume I'll have 5-6 hours of actual coding time per day, not 8. If you think you get 8 hours of focused coding every day, I'd love to see your calendar.
- **Clarify before committing.** If a ticket is vague, ask questions before pulling it into the sprint. "Improve search performance" is not a sprint ticket. "Reduce search API response time from 800ms to under 300ms by adding local caching" is.

### Sprint Retrospective

Happens at the end of each sprint. The team discusses: what went well, what didn't go well, and what should change. This is the most underrated ceremony. Seriously — if your team only does one Agile ceremony well, make it the retro. Good retrospectives create a feedback loop that continuously improves how the team works. Without retros, you just keep making the same mistakes sprint after sprint, like a runner who never watches their race footage.

Common retro formats:

- **Start/Stop/Continue** — What should we start doing? What should we stop doing? What should we keep doing?
- **Liked/Learned/Lacked/Longed For** — Four categories that encourage both positive and constructive feedback.
- **Sailboat** — The team is a sailboat. Wind (what pushes us forward), anchors (what holds us back), rocks (risks ahead), island (our goal).

The most important thing about retros: **follow through on action items.** If the team agrees to "improve PR review time" but nobody does anything about it, retros become performative and people stop engaging. Assign owners to each action item and track them.

### Sprint Review (Demo)

At the end of each sprint, the team demos what they built to stakeholders (PM, designer, sometimes leadership). This is your chance to show your work. Keep demos focused — show the feature working, explain any notable technical decisions, and flag any open issues. Don't read your slide deck word for word. Show the actual running app. Nothing sells your work better than a live demo that just... works.

## Git Workflow and Branching Strategy

Every team has a branching strategy, and if you don't understand yours, you're going to have a bad time. Merge conflicts at 5 PM on a Friday? Nobody wants that. The most common strategies:

**Trunk-based development** — Everyone works on short-lived feature branches off `main` and merges back quickly (within 1-2 days). This is what Google and most high-performing teams use. It requires good CI/CD and feature flags, but it minimizes merge conflicts and keeps the codebase integrated. Think of it like a highway — traffic flows best when cars merge quickly and keep moving, not when they take long detours.

**Git Flow** — Long-lived `develop` and `main` branches, with feature branches, release branches, and hotfix branches. More complex, but useful for teams that need to manage multiple release versions simultaneously. Less common in mobile development.

**GitHub Flow** — A simplified version: branch off `main`, make changes, open a PR, get reviewed, merge to `main`. This is what most smaller teams use and it works well for mobile apps with a single release track.

Regardless of which strategy you use, some git practices are universal:

- **Commit messages matter.** "fix stuff" is not a commit message. "Fix crash when navigating back from detail screen with empty state" is. Your commit history is documentation. Treat it that way. Six months from now, someone will run `git log` trying to understand when a behavior changed — make sure they can find it.
- **Rebase, don't merge (usually).** Rebasing keeps your branch history clean and linear. Merging creates merge commits that clutter the history. (Some teams prefer merge commits for traceability — follow your team's convention.)
- **Don't commit secrets.** API keys, signing keys, passwords — none of these belong in version control. Use environment variables, a secrets manager, or at minimum a `.gitignore`d local properties file. Once a secret is in git history, it's there forever (yes, even if you delete it in the next commit).
- **Pull before you push.** Always pull the latest `main` and resolve conflicts locally before pushing your branch. Don't let your PR have merge conflicts — it signals to reviewers that you're not keeping up with the codebase.

## Writing Good Documentation

Most engineers hate writing documentation. I get it — it feels like paperwork when you could be writing code. But here's the thing: documentation is what keeps a team functional as people join, leave, and forget things. Without it, your team's knowledge exists only in people's heads, and heads have a nasty habit of moving to other companies. The "Software Engineering at Google" book dedicates an entire chapter to this topic and makes the case that documentation is one of the highest-leverage activities an engineer can do.

### What to Document

- **Architecture decisions** — Why you chose a particular pattern, library, or approach. ADRs (Architecture Decision Records) are the standard format for this.
- **Setup instructions** — How to clone, build, and run the project. How to set up API keys, emulators, and test accounts. The new hire who joins next month will spend their first day trying to build the project. Make that day painless. If they spend four hours fighting build errors because the README says "just run the app" with no mention of the three environment variables they need, that's on the team.
- **Module structure** — What each module does, what it depends on, and how data flows through the system.
- **Non-obvious behavior** — Workarounds, platform quirks, known issues. If you spent two hours debugging something because of an undocumented Android API behavior, document it so nobody else wastes that time.
- **Runbooks** — Step-by-step procedures for common operations: how to do a release, how to respond to a crash spike, how to roll back a bad build.

### Where to Put Documentation

- **README.md** in the relevant module or repository. This is the first thing someone sees when they open the project.
- **Code comments** for non-obvious logic. Don't comment what the code does — comment why it does it.
- **Wiki or Confluence** for broader team documentation (architecture, processes, onboarding).
- **ADRs** in a `/docs/adr/` directory in the repository.
- **PR descriptions** — These are searchable documentation. When someone runs `git blame` and finds a confusing line, the PR description should explain the context.

### Documentation Maintenance

Here's the part nobody talks about: **documentation rots.** It's like food — it has an expiration date. If you change how a module works but don't update the documentation, you've made the documentation worse than useless — it's now actively misleading. Outdated documentation is like a road sign pointing in the wrong direction. It's worse than no sign at all, because people trust it and end up lost.

> **🔥 Real talk:** I've seen teams where the architecture documentation describes a module structure from two years ago that bears zero resemblance to the current code. New engineers read it, get confused, and then learn to distrust all documentation — which means even the good, up-to-date docs get ignored. Don't let this happen to your team.

GitHub's engineering guide says to "place as much importance on documentation maintenance as we do on creating good documentation." When you change code, check if any documentation references that code and update it.

## Handling Disagreements

Technical disagreements are healthy. They mean people care about the code quality. But they can also escalate into ego battles that waste time and damage relationships. I've seen a PR comment thread about whether to use `sealed class` vs `enum class` turn into a 47-comment war that took longer than writing the actual feature. Don't be those engineers. Here's how to handle disagreements productively.

**Lead with data, not opinions.** "I think we should use X" is weak. "I benchmarked X and Y. X handles 10K items in 4ms, Y takes 12ms. X also has better memory characteristics because of Z" is convincing. Google's code review guidelines state it clearly: "Technical facts and data overrule opinions and personal preferences." When you have numbers, bring numbers. When you don't have numbers, consider getting some before starting an argument.

**Disagree and commit.** Amazon popularized this phrase, but the principle is universal. Once a decision is made — even if you disagree — commit to it fully. Don't passively undermine a technical direction you lost the argument on. If you were wrong, learn from it. If you were right and the decision fails, help fix it instead of saying "I told you so." Nothing poisons a team faster than someone who agreed in the meeting but sabotages the execution.

**Escalate, don't stalemate.** If two engineers can't agree after 2-3 rounds of discussion, bring in the Tech Lead or a senior engineer as a tiebreaker. Don't let a PR sit for a week while two people argue about architecture in the comments. That's not productive — that's a process failure.

**Separate preferences from principles.** "I prefer putting the repository interface in the domain layer" is a preference. "Having the data layer depend on the domain layer creates a circular dependency that breaks the dependency rule" is a principle. Fight for principles. Be flexible on preferences. Knowing the difference between the two is a sign of engineering maturity.

## Building Psychological Safety

Google's Project Aristotle research found that **psychological safety** is the single most important factor in team effectiveness — more important than individual talent, team structure, or tools. Sounds weird, right? You'd think hiring the smartest engineers would be the biggest predictor of team success. But it's not. Psychological safety means team members feel safe to take risks, ask questions, make mistakes, and challenge ideas without fear of punishment or humiliation.

Think of it like a jazz band. The best jazz happens when musicians feel safe enough to improvise, try something unexpected, and even play a wrong note without the rest of the band glaring at them. If everyone's too scared to take a risk, you just get boring, safe music. Engineering teams work the same way — the best ideas come from people who aren't afraid to look stupid.

What this looks like in practice:

- **Model vulnerability.** If you're a senior engineer, say "I don't know" publicly. Ask questions about things you don't understand. This gives juniors permission to do the same. The "Software Engineering at Google" book emphasizes: "It's especially critical for those in leadership roles to model this behavior."
- **Welcome basic questions.** When someone asks something "obvious," answer it kindly. Nobody was born knowing how Android's Binder IPC works. The Recurse Center has social rules for this: no feigned surprise ("What?! You don't know what a Handler is?!"), no "well-actually" corrections, no back-seat driving.
- **Celebrate learning, not just knowing.** Acknowledge when someone asks a good question or admits they were wrong about something. These behaviors should be rewarded, not punished.
- **Blameless post-mortems.** When a production bug or outage happens, focus on what went wrong and how to prevent it, not who caused it. Google's post-mortem template includes: summary, timeline, root cause, impact, action items, and lessons learned. Notably absent: "who screwed up."

> **💡 The "aha" moment:** The best teams aren't the ones where nobody makes mistakes. They're the ones where people feel safe enough to catch and report mistakes quickly — before they become catastrophes. Psychological safety doesn't mean lower standards. It means faster error correction.

## Onboarding: Your First 90 Days

If you're joining a new team, congratulations — and also, brace yourself. The first few months are going to feel overwhelming. You'll open the codebase and wonder if it was written by humans or generated by a particularly chaotic algorithm. You'll sit in meetings where people use acronyms you've never heard. You'll feel like everyone else knows what's going on and you're the only one who's lost.

That's completely normal. Here's what to prioritize in your first three months:

**Week 1-2: Learn the landscape.**

- Set up the project. Build and run it locally. If the setup instructions are wrong or incomplete, fix them — that's your first PR, and it's a genuinely valuable one.
- Meet everyone on the team. 15-minute 1:1 coffee chats. Ask them: "What do you work on? What's the most confusing part of the codebase? What do you wish someone had told you when you joined?"
- Read the architecture documentation. If it doesn't exist, that's a problem — and an opportunity.
- Read recent PRs to understand the team's coding style, patterns, and review culture.
- Learn the tools: Jira/Linear, Slack channels, CI/CD pipeline, release process.

**Week 3-6: Start contributing.**

- Pick small, well-defined tickets. Bug fixes are ideal first tickets because they force you to understand the existing code. You're not just adding new code — you're reading, understanding, and modifying someone else's work. That's where the real learning happens.
- Ask questions aggressively. You'll never have more license to ask "dumb" questions than right now. Use it. Seriously — ask everything. In three months, people will expect you to know things. Right now, they expect you to ask.
- Attend every meeting and ceremony. Observe how the team works before suggesting changes.
- Take notes on everything that confuses you — processes, code, architecture. These notes will be valuable for the next new hire.

**Week 7-12: Build ownership.**

- Take on larger features. You should be able to work independently on medium-sized tickets by now.
- Start reviewing others' PRs. This is the fastest way to learn the codebase.
- Identify one area of the codebase that you can become the go-to person for. Ownership gives you purpose and visibility.
- Share what you've learned. Write documentation. Give a short tech talk. Answer questions in Slack.

I want to emphasize: **the 6-month ramp-up is normal.** Google tells new employees (they call them "Nooglers") that ramping up takes about six months. If you're four weeks in and feel overwhelmed, that's not a sign of inadequacy — it's a sign that you're learning. The engineers who struggle are the ones who pretend they understand everything and silently drown.

## Technical Ownership and the Bus Factor

The **bus factor** is the number of people who need to get hit by a bus (or, you know, go on vacation, switch teams, or quit) before a project is doomed. If only one person understands the payments module, and that person leaves, your team is in serious trouble. You're essentially one resignation away from a crisis. The "Software Engineering at Google" book calls this a "Single Point of Failure" and explicitly warns against it.

How to improve bus factor:

- **Pair on critical areas.** If you own a complex module, pair with a teammate for a few hours and walk them through it. Not a formal presentation — just "let me show you how this works and why." Think of it as cross-training. A restaurant where only one person knows how to make the signature dish is one sick day away from disappointing customers.
- **Rotate code reviewers.** Don't always assign the same person to review the same area. Spread knowledge by having different people review different modules.
- **Write it down.** Every module should have documentation that allows someone to understand and modify it without the original author being available.
- **Avoid hero culture.** If one person always stays late to fix production issues, that's not heroism — that's a process failure. Build systems and documentation so that any on-call engineer can respond.

## Continuous Improvement: Getting Better Over Time

Engineering is a career of perpetual learning. The technology changes fast — what was cutting-edge two years ago might be deprecated today — but the principles of working well in a team stay remarkably consistent. Here's how to keep growing:

- **Read production code.** Open-source projects like Now In Android, Tivi, Slack's Circuit, and Square's libraries are written by world-class engineers. Reading their code teaches you patterns and practices that no tutorial can. It's like studying game film if you're an athlete — you see how the best players actually play, not just how textbooks say you should play.
- **Watch conference talks selectively.** Don't binge-watch KotlinConf. Pick talks from engineers whose work you respect — Jake Wharton, Romain Guy, Chet Haase — and take notes. One deeply understood talk is worth more than ten you half-watched while doing laundry.
- **Contribute to open source.** Even small contributions (documentation fixes, bug reports with reproduction steps) teach you how professional engineering teams collaborate at scale.
- **Teach what you learn.** Writing a blog post, giving a tech talk, or mentoring a junior engineer forces you to understand a topic deeply enough to explain it clearly. You don't truly know something until you can teach it.
- **Get feedback.** Ask your manager and peers: "What's one thing I could do better?" Specific feedback is a gift. Seek it out.

The best engineers I've worked with aren't the ones who know the most. They're the ones who communicate clearly, ship consistently, help their teammates, and never stop learning. Technical skills get you hired. Team skills get you promoted.

Thanks for reading through all of this :), Happy Coding!
