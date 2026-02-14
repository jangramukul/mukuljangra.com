---
title: Code Review Best Practises Guide
layout: post
categories: post
tags:
  - Android
  - Best Practices
  - Kotlin
---

Early in my career, code reviews were about catching typos and enforcing bracket placement. The review comments were things like "add a blank line here" or "rename this variable." The reviews passed quickly, the code looked neat, and bugs shipped to production anyway. It took a few painful production incidents for me to realize that style-focused code reviews are almost useless. The real value of a code review is catching the things that compilers and linters can't — logic errors, missing edge cases, thread safety violations, security holes, and architectural drift.

The shift in my thinking happened after a P0 incident where a payment flow silently dropped errors because no one reviewed the error handling path. The code was clean, well-formatted, followed naming conventions perfectly — and it had a bug that cost us three days of revenue reconciliation. After that, I started treating code reviews as the last engineering checkpoint before code reaches users, not as a formatting exercise.

Here's how I approach reviews now, and what I look for.

## How to Approach a Large PR

Before getting into what to look for, it's worth talking about how to actually work through a PR — especially a big one. I used to open a PR, start at the first file, and read top to bottom. That's a terrible strategy. You end up spending 20 minutes on utility changes and run out of energy before you reach the important parts.

Now I follow a consistent order. First, I read the PR description and linked ticket — I need to understand what this change is supposed to do before I can evaluate whether it does it correctly. Second, I check the tests to understand the author's intent and what scenarios they considered. Third, I look at the architecture: which layers are touched, which modules are changed, do the dependency directions make sense. Only then do I go file by file on the implementation details.

I also time-box my reviews. SmartBear's study on code review effectiveness shows that reviewers find almost no new bugs after 60 minutes of continuous review, so I cap myself at about 45 minutes per session. If the PR needs more than that, it's either too large or I need to come back to it fresh. A 2,000-line PR is not reviewable in a single pass — I'll ask the author to split it. The ideal PR is 100-400 changed lines that do one thing. A refactoring PR should not also add a feature.

## Review for Correctness, Not Style

Linters and formatters exist for a reason. If your team is spending review cycles on indentation, bracket style, or import ordering, you're burning human attention on problems that `ktlint` or `detekt` solve automatically. Set up formatting rules in CI — `ktlint --format` on pre-commit or as a CI check — and never comment on style again. Your review attention is limited. Spend it on logic, not aesthetics.

The question I ask for every changed function is: "Does this code do what the PR description says it does?" Not "does it look right" — does it actually produce the correct output for all valid inputs? This means reading the code carefully enough to trace the logic path, not just skimming for patterns that look familiar.

```kotlin
// This looks correct at a glance
fun calculateDiscount(items: List<CartItem>): Double {
    val subtotal = items.sumOf { it.price * it.quantity }
    return if (subtotal > 100) subtotal * 0.1 else 0.0
}

// But what if items is empty? What if price is negative?
// What if quantity is 0? What if subtotal overflows?
// A correctness review catches these questions.
```

## Look for Missing Edge Cases

The happy path is easy to review. What's hard — and valuable — is asking "what happens when this fails?" For every function in a PR, I mentally run through the edge cases: null inputs, empty collections, network failures, concurrent access, boundary values, and permission denials. Most production bugs aren't in the main logic. They're in the paths that nobody thought about during implementation.

A pattern I've noticed is that developers test their code against 2-3 scenarios before opening a PR, and the PR works for those scenarios. But the 4th scenario — the one they didn't think of — is where the bug hides. In Android specifically, the common missing edge cases are: What happens on process death? What happens if the user rotates during a network call? What happens if the user double-taps a button? What happens if the list has 10,000 items instead of 10?

```kotlin
// PR shows this click handler
fun onSubmitClicked() {
    viewModelScope.launch {
        _uiState.update { it.copy(isLoading = true) }
        val result = repository.submit(formData)
        _uiState.update { it.copy(isLoading = false, success = true) }
    }
}

// Questions a good review raises:
// 1. What if the user taps submit twice before the first call completes?
// 2. What if repository.submit() throws? isLoading stays true forever
// 3. What if the ViewModel is cleared during the network call?
// 4. Is formData validated before submission?
```

## Check Thread Safety

In Android, thread safety bugs are the hardest to reproduce and the most expensive to fix. They show up as intermittent crashes in production that you can never reproduce locally. During a review, I look for shared mutable state accessed from multiple coroutines or threads without synchronization. The most common pattern is a `var` property in a class that's modified from `viewModelScope.launch` and read from a different coroutine.

```kotlin
class SyncManager(
    private val api: SyncApi,
    private val scope: CoroutineScope
) {
    // Red flag: mutable state accessed from multiple coroutines
    private var lastSyncTimestamp: Long = 0L
    private val pendingItems = mutableListOf<SyncItem>()

    fun enqueue(item: SyncItem) {
        pendingItems.add(item)  // Called from UI thread
        scope.launch(Dispatchers.IO) {
            sync(pendingItems.toList())  // Read from IO thread
            pendingItems.clear()  // Modified from IO thread
        }
    }
}
```

The fix is usually a `Mutex`, `ConcurrentHashMap`, or restructuring to use a `Channel` or `MutableStateFlow`. The important thing during review is spotting the pattern: mutable state + multiple threads + no synchronization = eventual crash. I also watch for `lazy(LazyThreadSafetyMode.NONE)` — some developers use it for "performance" without understanding that it removes the thread-safety guarantee that `lazy` provides by default.

## Verify Error Handling

Missing error handling is the single most common category of bugs I catch in reviews. The pattern is a coroutine that calls a suspend function but doesn't handle the failure case. The developer tested the happy path, it worked, they opened the PR. But in production, networks fail, servers return 500s, and JSON responses come back malformed.

I look for three things. First, are exceptions from suspend functions caught? A bare `repository.fetchData()` inside a `launch` block will crash the app if it throws, because `launch` propagates exceptions to the parent scope. Second, is the error communicated to the user? Silently swallowing exceptions with an empty `catch` block is worse than crashing — the user sees nothing happen and doesn't know why. Third, is the error recoverable? Does the UI offer a retry button? Does the state reset to allow another attempt?

```kotlin
// Common in PRs — no error handling
fun loadProfile() {
    viewModelScope.launch {
        val profile = userRepository.getProfile()  // What if this throws?
        _uiState.value = ProfileState.Success(profile)
    }
}

// What the review should push for
fun loadProfile() {
    viewModelScope.launch {
        _uiState.value = ProfileState.Loading
        userRepository.getProfile()
            .onSuccess { profile ->
                _uiState.value = ProfileState.Success(profile)
            }
            .onFailure { error ->
                _uiState.value = ProfileState.Error(
                    message = error.toUserMessage(),
                    retryable = error.isRetryable()
                )
            }
    }
}
```

## Scan for Security Concerns

This one is easy to overlook because security bugs don't crash your app during testing — they silently leak data in production. I've made it a habit to scan every PR for a few specific patterns. Hardcoded API keys, secrets, or tokens in source code is the obvious one, but it still shows up more often than you'd think. A developer testing a feature quickly pastes a key inline, forgets to move it to `local.properties` or a secrets manager, and opens the PR. Once it's merged, that key is in the git history forever.

Beyond secrets, I watch for raw SQL queries that concatenate user input instead of using parameterized queries, which opens the door to SQL injection. I check for sensitive data written to `SharedPreferences` without encryption — use `EncryptedSharedPreferences` for tokens and PII. WebView usage gets extra scrutiny: is JavaScript enabled unnecessarily? Is `setAllowFileAccess(true)` set when it shouldn't be? Is the WebView loading arbitrary URLs from intent extras without validation?

```kotlin
// Security red flags to catch in review
class PaymentRepository(private val db: AppDatabase) {

    // BAD: API key hardcoded in source
    private val apiKey = "sk_live_xxxx_your_key_here"

    // BAD: raw SQL with string concatenation — SQL injection risk
    fun findOrder(orderId: String): Order? {
        val cursor = db.query("SELECT * FROM orders WHERE id = '$orderId'")
        return cursor.toOrder()
    }

    // BAD: sensitive data in plain SharedPreferences
    fun cacheToken(context: Context, token: String) {
        context.getSharedPreferences("auth", MODE_PRIVATE)
            .edit().putString("access_token", token).apply()
    }
}

// What the review should push for:
// 1. Move apiKey to local.properties or a secrets manager
// 2. Use parameterized queries: db.query("SELECT * FROM orders WHERE id = ?", arrayOf(orderId))
// 3. Use EncryptedSharedPreferences for tokens
```

## Check Naming and Readability

I said earlier that style reviews are wasteful, and I stand by that for formatting. But naming is different. Naming is not style — it's communication. A function called `process()` tells you nothing. A function called `validateAndSubmitPayment()` tells you exactly what it does and hints that it might be doing too much. During a review, I check whether names accurately describe what the code does, and whether a developer reading this code six months from now would understand the intent without reading the implementation.

The rule I follow: if I need to read the function body to understand what a function does, the name is wrong. Variable names should describe what they hold, not their type — `userList` is worse than `activeUsers`. Boolean names should read as questions: `isLoading`, `hasPermission`, `shouldRetry`. These aren't style preferences — they're the difference between code that communicates intent and code that requires deciphering.

## Watch for Architecture Violations

Every codebase has architectural boundaries — layers, module boundaries, dependency rules. In a clean architecture setup, the domain layer shouldn't depend on the data layer. In a modularized project, feature modules shouldn't depend on each other directly. These rules exist on a wiki page somewhere that everyone read once and forgot, and code reviews are where you actually enforce them.

The violations I catch most often are: a ViewModel directly calling a Retrofit API instead of going through a repository, a feature module importing classes from another feature module instead of depending on a shared API module, a Composable function creating a ViewModel internally instead of receiving state as parameters, or a data layer class importing `android.content.Context` when it should be using an abstracted interface.

These violations don't cause immediate bugs. The code works fine. But they create coupling that makes the codebase progressively harder to change. Catching them in review is significantly cheaper than untangling them during a refactoring six months later.

## Look for Performance Red Flags

You don't need to profile every PR, but certain patterns should trigger immediate concern during review. Allocating objects inside `onDraw()` or during Compose recomposition. Running database queries on the main thread. Using `regex.toRegex()` inside a frequently called function instead of compiling it once. Creating new coroutine scopes without cancelling them.

```kotlin
// Performance red flag — regex compiled on every call
fun isValidEmail(email: String): Boolean {
    return email.matches("[a-zA-Z0-9+._%\\-]{1,256}@[a-zA-Z0-9][a-zA-Z0-9\\-]{0,64}(\\.[a-zA-Z0-9][a-zA-Z0-9\\-]{0,25})+".toRegex())
}

// Better — compile once
private val EMAIL_REGEX = "[a-zA-Z0-9+._%\\-]{1,256}@[a-zA-Z0-9][a-zA-Z0-9\\-]{0,64}(\\.[a-zA-Z0-9][a-zA-Z0-9\\-]{0,25})+".toRegex()

fun isValidEmail(email: String): Boolean = email.matches(EMAIL_REGEX)
```

In Compose specifically, I watch for unstable lambda captures (lambdas that capture mutable state cause unnecessary recompositions), missing `remember` blocks for objects created during composition, and `LazyColumn` items without stable keys. A single unstable lambda in a `LazyColumn` item can cause the entire list to recompose on every frame during scrolling — I've seen this drop frame rates from 60fps to 20fps on mid-range devices.

## Test Coverage Expectations

I don't believe in enforcing a specific test coverage number — 80% coverage where the tests assert nothing is worse than 40% coverage with meaningful assertions. What I look for in a review is whether the PR includes tests for the new behavior it introduces. If a PR adds a new repository method, there should be tests for the success case, the error case, and at least one edge case. If a PR fixes a bug, there should be a test that reproduces the bug and verifies the fix.

The question I ask isn't "what's the coverage percentage?" but "if someone breaks this code next month, will a test fail?" If the answer is no, the PR needs more tests. Tests that verify `result != null` are nearly useless. Tests that verify `result.items.size == 3 && result.items[0].id == expectedId` actually catch regressions.

For Android specifically, I expect unit tests for ViewModels and use cases, integration tests for repository-to-database flows, and UI tests for critical user journeys. Not every PR needs all three, but the author should be able to explain why tests are missing if they are.

## Review Etiquette and Tone

I want to talk about something most code review guides skip — how you write review comments. I've been on both sides of reviews that felt collaborative and reviews that felt like an interrogation. The difference is almost never about what's being said — it's about how it's said. A comment like "This is wrong, use X instead" and "Have you considered using X here? It handles the edge case where..." communicate the same technical feedback, but the second one invites a conversation instead of putting the author on the defensive.

I try to phrase feedback as questions when the intent isn't a hard blocker. "What happens if this list is empty?" is better than "You didn't handle the empty list case." The question makes the author think through the scenario themselves, which is more effective than being told what to fix. For things that genuinely must change before merge — a crash, a security issue, a data loss risk — I'm direct, but I explain why. "This will crash on API 26 because `LocalDate.parse` without a formatter throws on certain locales" gives the author context, not just a command.

I've also started explicitly labeling my comments as blocking or non-blocking. Something like "nit: this could be a `let` block" tells the author they can take it or leave it. "Blocking: this raw query is vulnerable to SQL injection" tells them this must be fixed. Without that distinction, authors either treat every comment as mandatory and resent the review, or treat every comment as optional and skip the important ones. Being explicit about severity keeps the PR moving.

And here we are done!
Thanks for reading!
