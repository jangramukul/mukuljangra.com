---
title: The Complete Guide to Working in an Engineering Team
layout: post
categories: post
tags:
  - Android
  - Best Practices
  - Architecture
---

When I started my first job as an Android engineer, I thought the hard part was writing code. I knew Kotlin, I understood Activities and Fragments, and I could build features. What I didn't know was how to actually work in a team. How to write a good pull request description. How to ask questions without annoying people. How to communicate when I was stuck. How to unblock myself. How to run a sprint. How to handle disagreements in code review. How to estimate work. How to not silently struggle for three days on something a teammate could have helped me solve in twenty minutes.

The truth is, nobody teaches you this stuff. University teaches you algorithms and data structures. Tutorials teach you how to use libraries. But nobody sits you down and explains how an engineering team actually operates day to day. And this is the part that makes or breaks your career. I've seen brilliant engineers fail because they couldn't collaborate, and I've seen average engineers thrive because they communicated well, shipped consistently, and made everyone around them more productive. Google's own research (Project Aristotle) confirmed this — the number one factor in high-performing teams isn't individual talent. It's psychological safety. The ability to take risks, ask questions, and admit mistakes without fear of judgment.

This post is everything I wish someone had told me on my first day. It covers how engineering teams are structured, how work flows from idea to production, how to communicate effectively, how to write pull requests that get reviewed quickly, how to handle code review without ego, how to run sprints, how to deal with being stuck, and how to grow from a junior engineer into someone the team relies on. It's long. I meant it to be. Bookmark it and come back when you need a specific section.

## How Engineering Teams Are Structured

Most engineering teams follow some variation of a squad model. A squad is a small, cross-functional team — typically 4 to 8 engineers — that owns a specific area of the product. You'll usually have a mix of Android engineers, iOS engineers, backend engineers, a product manager (PM), a designer, and a QA engineer. The exact composition varies by company, but the principle is the same: a squad has everything it needs to ship features independently without waiting on other teams.

Within the squad, you'll encounter a few key roles. The **Product Manager** defines what to build and why. They own the roadmap, prioritize features, write requirements, and are your primary source for "what does the user actually need?" The **Tech Lead** (or Principal Engineer) makes architectural decisions, sets technical direction, and is usually the person who's been on the team longest. The **Engineering Manager** handles people — career growth, 1:1s, hiring, performance reviews. In some companies, the EM and Tech Lead are the same person. The **QA Engineer** tests your work before it reaches users. The **Scrum Master** (or Agile Coach) runs ceremonies and removes blockers.

Understanding these roles matters because it changes who you talk to and when. Got a question about what a feature should do? Ask the PM. Confused about the architecture of a module? Ask the Tech Lead. Need to discuss your career growth? Talk to your EM. Don't go to your EM with architecture questions or your Tech Lead with career concerns — it wastes everyone's time and signals that you don't understand the team structure.

Beyond your squad, larger organizations have **chapters** (or guilds) — groups of engineers with the same specialty (all Android engineers, for example) across different squads. Chapters share knowledge, maintain coding standards, and ensure consistency across the product. If your squad's Android app handles navigation differently from another squad's, the Android chapter is where that gets resolved. Spotify pioneered this model publicly, and many companies have adapted it since.

## How Work Flows: From Idea to Production

Understanding the flow of work is fundamental. Here's how a feature typically moves through an engineering team:

**1. Product defines the problem.** The PM writes a product requirement document (PRD) or a brief that explains what the user needs, why it matters, and what success looks like. Good PMs include acceptance criteria — specific conditions that must be true for the feature to be considered done. If you get a vague brief, ask for acceptance criteria before you start writing code. "Build a search feature" is not a specification. "Search should support minimum 3-character queries, show results within 500ms, display up to 20 results, and show an empty state when no results match" — that's something you can build and test against.

**2. Design creates the experience.** The designer produces mockups, user flows, and sometimes interactive prototypes. As an engineer, review these early. Don't wait until the design is "final" to raise technical concerns. If a design requires an API that doesn't exist, or if an animation would tank performance on low-end devices, say so now. The cost of changing a Figma file is near zero. The cost of rewriting a feature after three weeks of implementation is enormous.

**3. Engineering breaks it down.** This is where you come in. The Tech Lead (or the squad collectively) breaks the feature into technical tasks. Each task becomes a ticket — a Jira ticket, a Linear issue, a GitHub issue, whatever your team uses. Good tickets are small, specific, and independently shippable. "Implement search" is a bad ticket. "Add search text field with debounce" and "Implement search API repository" and "Build search results LazyColumn" — those are good tickets. A good rule of thumb: each ticket should be completable in 1-3 days. If it's bigger than that, break it down further.

**4. Sprint planning.** The team picks which tickets to work on in the upcoming sprint (usually a 1-2 week cycle). Engineers estimate effort (story points, t-shirt sizes, or just time estimates — the format varies). The key here: be honest about estimates. Padding estimates to look safe is just as bad as underestimating to look fast. Over time, your estimates will get more accurate as you learn the codebase and your own pace.

**5. Implementation.** You pick a ticket, create a branch, write code, write tests, and raise a pull request. More on this process below.

**6. Code review.** Teammates review your PR. You address feedback, iterate, and merge.

**7. QA testing.** The QA engineer tests the feature against the acceptance criteria. They'll file bugs if anything is wrong. Fix them.

**8. Release.** The feature ships to users, either through a regular release cycle or a feature flag. Monitor crash reports and user feedback.

This flow isn't always linear. You'll often be doing steps 5-8 for multiple tickets simultaneously while step 4 is happening for the next sprint. The key is understanding where your work fits in the bigger picture.

## Day-to-Day Communication

Communication is where most engineers underperform, not because they lack skills, but because nobody taught them the norms. Here's what good engineering communication looks like.

### Async-First Communication

GitHub's engineering team published their internal communication guide publicly (github/how-engineering-communicates), and their number one principle is **"be asynchronous first."** Asynchronous communication means you send a message and the other person responds when they can — no expectation of an immediate reply. This is the opposite of tapping someone on the shoulder or sending "hey, got a sec?" on Slack.

Why async-first? Because engineers need deep focus time. Research shows that knowledge workers are most productive with large blocks of uninterrupted time. A two-hour block is not the same as four 30-minute blocks. Every interruption — a Slack ping, a "quick question," a last-minute meeting — costs 10-15 minutes of context-switching time to get back to where you were. Multiply that across a team, and you lose hours of productivity daily.

In practice, async-first means:

- **Write your full question in one message.** Don't send "hey" and wait. Don't send "can I ask you something?" Include the context, what you've tried, and what you need. The recipient should be able to help you without a back-and-forth.
- **Use channels, not DMs.** Post questions in public Slack channels (or Teams, or whatever your company uses). Others might have the same question, and the answer becomes searchable. DMs are black holes — when you leave the company, that knowledge leaves with you.
- **Don't expect immediate responses.** Unless something is on fire in production, give people time. Aim to respond to non-urgent messages within one business day.
- **Use `@here` and `@channel` sparingly.** These are the equivalent of shouting in a crowded room. Reserve them for genuinely urgent situations.

### Writing Things Down

The second principle from GitHub's guide: **"write things down."** Especially the "why" behind decisions. When you make a technical decision — choosing Room over SQLDelight, or picking MVI over MVVM for a new module — write down why. Not just the what. A year from now, someone (possibly you) will look at that code and wonder why it was done that way. If the reasoning is documented, they can build on it. If it's not, they might undo your work without understanding the context.

Google calls this the "Chesterton's Fence" principle — from the book "Software Engineering at Google" — before removing or changing something, first understand why it's there. Documentation makes this possible.

Where to write things down:

- **PR descriptions** — Explain what the PR does and why. Not just "fix bug." What bug? What caused it? How did you fix it? What other approaches did you consider?
- **Architecture Decision Records (ADRs)** — Short documents that capture significant technical decisions. "We chose X over Y because of Z." Store these in your repo so they're versioned alongside your code.
- **Jira/Linear comments** — When requirements change or you discover something unexpected during implementation, document it on the ticket. Future you will thank present you.
- **README files** — Every module should have a README that explains what it does, how to set it up, and any quirks or gotchas.

### Stand-ups

The daily standup (or daily scrum) is a short meeting — ideally 10-15 minutes — where each team member shares three things: what they did yesterday, what they're doing today, and whether anything is blocking them. The purpose is coordination, not status reporting. You're not reporting to your manager. You're synchronizing with your teammates so that everyone knows what's happening and can offer help or flag conflicts.

Common standup mistakes:

- **Turning it into a status report.** "I worked on the search feature" tells your team nothing actionable. "I finished the search API integration, and today I'm building the results UI. I'm blocked on the design for the empty state — the mockup doesn't cover it" — that's useful. Your PM now knows to get you the empty state design, and your teammates know not to pick up search-related tickets because you're already on it.
- **Going too deep.** Standup isn't the place to debug a problem together. If something needs discussion, say "I need to talk to Lee about the caching strategy after standup" and move on.
- **Hiding blockers.** If you're stuck, say so. I used to struggle silently for days because I didn't want to look incompetent. But being stuck for three days and not telling anyone isn't a sign of competence — it's a sign of poor communication. Your team can't help you if they don't know you need help.

### When to Escalate

Not everything can be resolved asynchronously. GitHub's guide recommends treating meetings as a "point of escalation" — you start with async (a Slack message, a ticket comment, a PR review), and if you can't resolve it there, you escalate to a synchronous call. If a PR review goes back and forth for more than 3-4 rounds without consensus, jump on a 15-minute call. You'll resolve it faster, and you'll avoid the frustration of misinterpreted text.

The escalation ladder looks like this: **ticket comment → Slack message → quick call → scheduled meeting → bring in the Tech Lead.** Most issues resolve at the first or second level. If you're regularly escalating to meetings, something is wrong with your team's written communication.

## How to Handle Being Stuck

Every engineer gets stuck. The difference between a junior and a senior isn't that seniors never get stuck — it's that they get unstuck faster because they have better strategies. Here's my framework:

**1. Define the problem clearly.** Before asking anyone for help, write down exactly what you're trying to do, what you expected to happen, what's actually happening, and what you've already tried. Half the time, the act of writing this down helps you find the answer yourself. This is rubber duck debugging.

**2. Time-box your solo debugging.** Give yourself 30-60 minutes. If you can't figure it out in that time, stop and ask for help. The old advice of "try harder" is wrong. Struggling silently for a full day is not impressive — it's wasteful.

**3. Search before asking.** Check the codebase for similar implementations. Search Slack history. Check the official documentation. Search your team's ADRs and wiki.

**4. Ask smart questions.** When you do ask, provide context. "This doesn't work" is a useless question. "I'm trying to observe a StateFlow from the repository in my ViewModel, but `collectAsStateWithLifecycle` is recomposing on every emission even when the value hasn't changed. Here's my code [link]. I've verified the Flow is emitting distinct values with a log. I suspect the issue is that my data class doesn't implement equals correctly, but I'm not sure. Can someone take a look?" — that's a great question. It shows effort, provides context, and even includes a hypothesis.

**5. Share your solution.** When you figure it out — whether alone or with help — share the solution in the channel where you asked. This builds a searchable knowledge base for the team.

## Pull Requests: The Core of Team Engineering

Pull requests are where individual work becomes team work. A PR is not just a code delivery mechanism — it's a communication artifact, a knowledge-sharing tool, and a quality gate all in one. Google's engineering practices guide emphasizes that "the primary purpose of code review is to make sure that the overall code health of the codebase is improving over time." Here's how to do PRs well.

### Writing Good PRs

**Keep them small.** The single biggest factor in PR quality is size. Google's eng-practices guide has an entire page on "Small CLs" (their term for changesets). A PR with 50-100 lines of changes gets reviewed in minutes and gets high-quality feedback. A PR with 800 lines sits in the queue for days, gets rubber-stamped, and bugs sneak through because no reviewer has the stamina to carefully read 800 lines of code.

If your feature requires 800 lines, break it into multiple PRs. Ship the data layer first (models, repository, data source). Then the domain layer (use cases if you have them). Then the UI. Each PR is independently reviewable and independently testable.

**Write descriptive titles and descriptions.** Google's guide says a CL description should answer two questions: what change is being made, and why. The title should be a short summary that stands alone — someone scanning the git history should understand what this PR did without opening it. "Fix bug" is never an acceptable title. "Fix crash when search query is empty on API 28 devices" is.

The description should include:

- What the PR does (summary)
- Why the change is needed (context, ticket link)
- How you implemented it (approach, especially if there were alternatives)
- Screenshots or recordings for UI changes
- Testing notes (what you tested manually, what automated tests cover)

**Link to the ticket.** Always. Every PR should reference the Jira/Linear ticket it addresses. This creates a bidirectional trail — from ticket to code and from code to ticket.

**Self-review before requesting review.** Read your own diff. I catch 20-30% of my mistakes this way. Look for: leftover debug logs, TODOs you forgot to address, hardcoded strings that should be resources, missing null checks, functions that are too long, naming inconsistencies.

### Reviewing Others' PRs

Code review is a skill. It's not about finding every possible improvement — it's about ensuring the PR improves the overall health of the codebase.

**Review promptly.** Google's standard is to respond to a code review request within one business day. Ideally, within a few hours. Slow reviews block your teammates and kill team velocity. If you can't review it today, say so — "I'm heads-down on the search feature today, I'll review this tomorrow morning."

**Focus on what matters.** Don't leave 30 comments about formatting when there's a concurrency bug in the ViewModel. Prioritize: correctness first, then design, then readability, then style. If something is a minor preference rather than a real issue, prefix it with "nit:" to signal it's not a blocker.

**Be constructive, not adversarial.** "This is wrong" is not helpful. "I think there might be a race condition here because the StateFlow could emit before the coroutine scope is active. What if we used `SharingStarted.WhileSubscribed(5000)` instead?" — that's constructive. You're explaining the problem, showing you understand the code, and offering a specific alternative.

Google's reviewer guide has a principle I love: **"In general, reviewers should favor approving a PR once it is in a state where it definitely improves the overall code health of the system, even if the PR isn't perfect."** There is no such thing as perfect code — there is only better code. Don't hold up a PR for days over style preferences.

**Don't take it personally.** And don't make it personal. You are not your code. When someone suggests a change, they're improving the codebase, not attacking your competence. If you disagree with feedback, explain your reasoning. Have a technical discussion. But don't dig in your heels because of ego — be open to influence. Google's "Software Engineering at Google" book puts it this way: "The more open you are to influence, the more you are able to influence."

## Running Sprints and Agile Ceremonies

Most engineering teams use some form of Agile, usually Scrum or Kanban. Here's what actually matters in practice.

### Sprint Planning

Happens at the start of each sprint (1-2 weeks). The team looks at the prioritized backlog and commits to a set of tickets. Key principles:

- **Don't overcommit.** It's better to finish everything you committed to than to start 10 things and finish 5. Consistent delivery builds trust with your PM and stakeholders.
- **Factor in unknowns.** Leave buffer for bugs, production incidents, code review time, and the inevitable meetings that eat into your coding hours. I usually assume I'll have 5-6 hours of actual coding time per day, not 8.
- **Clarify before committing.** If a ticket is vague, ask questions before pulling it into the sprint. "Improve search performance" is not a sprint ticket. "Reduce search API response time from 800ms to under 300ms by adding local caching" is.

### Sprint Retrospective

Happens at the end of each sprint. The team discusses: what went well, what didn't go well, and what should change. This is the most underrated ceremony. Good retrospectives create a feedback loop that continuously improves how the team works.

Common retro formats:

- **Start/Stop/Continue** — What should we start doing? What should we stop doing? What should we keep doing?
- **Liked/Learned/Lacked/Longed For** — Four categories that encourage both positive and constructive feedback.
- **Sailboat** — The team is a sailboat. Wind (what pushes us forward), anchors (what holds us back), rocks (risks ahead), island (our goal).

The most important thing about retros: **follow through on action items.** If the team agrees to "improve PR review time" but nobody does anything about it, retros become performative and people stop engaging. Assign owners to each action item and track them.

### Sprint Review (Demo)

At the end of each sprint, the team demos what they built to stakeholders (PM, designer, sometimes leadership). This is your chance to show your work. Keep demos focused — show the feature working, explain any notable technical decisions, and flag any open issues. Don't read your slide deck word for word. Show the actual running app.

## Git Workflow and Branching Strategy

Every team has a branching strategy. The most common ones:

**Trunk-based development** — Everyone works on short-lived feature branches off `main` and merges back quickly (within 1-2 days). This is what Google and most high-performing teams use. It requires good CI/CD and feature flags, but it minimizes merge conflicts and keeps the codebase integrated.

**Git Flow** — Long-lived `develop` and `main` branches, with feature branches, release branches, and hotfix branches. More complex, but useful for teams that need to manage multiple release versions simultaneously. Less common in mobile development.

**GitHub Flow** — A simplified version: branch off `main`, make changes, open a PR, get reviewed, merge to `main`. This is what most smaller teams use and it works well for mobile apps with a single release track.

Regardless of which strategy you use, some git practices are universal:

- **Commit messages matter.** "fix stuff" is not a commit message. "Fix crash when navigating back from detail screen with empty state" is. Your commit history is documentation. Treat it that way.
- **Rebase, don't merge (usually).** Rebasing keeps your branch history clean and linear. Merging creates merge commits that clutter the history. (Some teams prefer merge commits for traceability — follow your team's convention.)
- **Don't commit secrets.** API keys, signing keys, passwords — none of these belong in version control. Use environment variables, a secrets manager, or at minimum a `.gitignore`d local properties file.
- **Pull before you push.** Always pull the latest `main` and resolve conflicts locally before pushing your branch. Don't let your PR have merge conflicts — it signals to reviewers that you're not keeping up with the codebase.

## Writing Good Documentation

Most engineers hate writing documentation. But documentation is what keeps a team functional as people join, leave, and forget things. The "Software Engineering at Google" book dedicates an entire chapter to this topic and makes the case that documentation is one of the highest-leverage activities an engineer can do.

### What to Document

- **Architecture decisions** — Why you chose a particular pattern, library, or approach. ADRs (Architecture Decision Records) are the standard format for this.
- **Setup instructions** — How to clone, build, and run the project. How to set up API keys, emulators, and test accounts. The new hire who joins next month will spend their first day trying to build the project. Make that day painless.
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

Here's the part nobody talks about: **documentation rots.** If you change how a module works but don't update the documentation, you've made the documentation worse than useless — it's now actively misleading. GitHub's engineering guide says to "place as much importance on documentation maintenance as we do on creating good documentation." When you change code, check if any documentation references that code and update it.

## Handling Disagreements

Technical disagreements are healthy. They mean people care about the code quality. But they can also escalate into ego battles that waste time and damage relationships. Here's how to handle them productively.

**Lead with data, not opinions.** "I think we should use X" is weak. "I benchmarked X and Y. X handles 10K items in 4ms, Y takes 12ms. X also has better memory characteristics because of Z" is convincing. Google's code review guidelines state it clearly: "Technical facts and data overrule opinions and personal preferences."

**Disagree and commit.** Amazon popularized this phrase, but the principle is universal. Once a decision is made — even if you disagree — commit to it fully. Don't passively undermine a technical direction you lost the argument on. If you were wrong, learn from it. If you were right and the decision fails, help fix it instead of saying "I told you so."

**Escalate, don't stalemate.** If two engineers can't agree after 2-3 rounds of discussion, bring in the Tech Lead or a senior engineer as a tiebreaker. Don't let a PR sit for a week while two people argue about architecture in the comments. That's not productive — that's a process failure.

**Separate preferences from principles.** "I prefer putting the repository interface in the domain layer" is a preference. "Having the data layer depend on the domain layer creates a circular dependency that breaks the dependency rule" is a principle. Fight for principles. Be flexible on preferences.

## Building Psychological Safety

Google's Project Aristotle research found that **psychological safety** is the single most important factor in team effectiveness — more important than individual talent, team structure, or tools. Psychological safety means team members feel safe to take risks, ask questions, make mistakes, and challenge ideas without fear of punishment or humiliation.

What this looks like in practice:

- **Model vulnerability.** If you're a senior engineer, say "I don't know" publicly. Ask questions about things you don't understand. This gives juniors permission to do the same. The "Software Engineering at Google" book emphasizes: "It's especially critical for those in leadership roles to model this behavior."
- **Welcome basic questions.** When someone asks something "obvious," answer it kindly. Nobody was born knowing how Android's Binder IPC works. The Recurse Center has social rules for this: no feigned surprise ("What?! You don't know what a Handler is?!"), no "well-actually" corrections, no back-seat driving.
- **Celebrate learning, not just knowing.** Acknowledge when someone asks a good question or admits they were wrong about something. These behaviors should be rewarded, not punished.
- **Blameless post-mortems.** When a production bug or outage happens, focus on what went wrong and how to prevent it, not who caused it. Google's post-mortem template includes: summary, timeline, root cause, impact, action items, and lessons learned. Notably absent: "who screwed up."

## Onboarding: Your First 90 Days

If you're joining a new team, here's what to prioritize in your first three months:

**Week 1-2: Learn the landscape.**

- Set up the project. Build and run it locally. If the setup instructions are wrong or incomplete, fix them — that's your first PR.
- Meet everyone on the team. 15-minute 1:1 coffee chats. Ask them: "What do you work on? What's the most confusing part of the codebase? What do you wish someone had told you when you joined?"
- Read the architecture documentation. If it doesn't exist, that's a problem — and an opportunity.
- Read recent PRs to understand the team's coding style, patterns, and review culture.
- Learn the tools: Jira/Linear, Slack channels, CI/CD pipeline, release process.

**Week 3-6: Start contributing.**

- Pick small, well-defined tickets. Bug fixes are ideal first tickets because they force you to understand the existing code.
- Ask questions aggressively. You'll never have more license to ask "dumb" questions than right now. Use it.
- Attend every meeting and ceremony. Observe how the team works before suggesting changes.
- Take notes on everything that confuses you — processes, code, architecture. These notes will be valuable for the next new hire.

**Week 7-12: Build ownership.**

- Take on larger features. You should be able to work independently on medium-sized tickets by now.
- Start reviewing others' PRs. This is the fastest way to learn the codebase.
- Identify one area of the codebase that you can become the go-to person for. Ownership gives you purpose and visibility.
- Share what you've learned. Write documentation. Give a short tech talk. Answer questions in Slack.

I want to emphasize: **the 6-month ramp-up is normal.** Google tells new employees (they call them "Nooglers") that ramping up takes about six months. If you're four weeks in and feel overwhelmed, that's not a sign of inadequacy — it's a sign that you're learning. The engineers who struggle are the ones who pretend they understand everything and silently drown.

## Technical Ownership and the Bus Factor

The **bus factor** is the number of people who need to get hit by a bus before a project is doomed. If only one person understands the payments module, and that person leaves, your team is in serious trouble. The "Software Engineering at Google" book calls this a "Single Point of Failure" and explicitly warns against it.

How to improve bus factor:

- **Pair on critical areas.** If you own a complex module, pair with a teammate for a few hours and walk them through it. Not a formal presentation — just "let me show you how this works and why."
- **Rotate code reviewers.** Don't always assign the same person to review the same area. Spread knowledge by having different people review different modules.
- **Write it down.** Every module should have documentation that allows someone to understand and modify it without the original author being available.
- **Avoid hero culture.** If one person always stays late to fix production issues, that's not heroism — that's a process failure. Build systems and documentation so that any on-call engineer can respond.

## Continuous Improvement: Getting Better Over Time

Engineering is a career of perpetual learning. The technology changes fast, but the principles of working well in a team stay the same. Here's how to keep growing:

- **Read production code.** Open-source projects like Now In Android, Tivi, Slack's Circuit, and Square's libraries are written by world-class engineers. Reading their code teaches you patterns and practices that no tutorial can.
- **Watch conference talks selectively.** Don't binge-watch KotlinConf. Pick talks from engineers whose work you respect — Jake Wharton, Romain Guy, Chet Haase — and take notes.
- **Contribute to open source.** Even small contributions (documentation fixes, bug reports with reproduction steps) teach you how professional engineering teams collaborate at scale.
- **Teach what you learn.** Writing a blog post, giving a tech talk, or mentoring a junior engineer forces you to understand a topic deeply enough to explain it clearly.
- **Get feedback.** Ask your manager and peers: "What's one thing I could do better?" Specific feedback is a gift. Seek it out.

The best engineers I've worked with aren't the ones who know the most. They're the ones who communicate clearly, ship consistently, help their teammates, and never stop learning. Technical skills get you hired. Team skills get you promoted.

Thanks for reading through all of this :), Happy Coding!
