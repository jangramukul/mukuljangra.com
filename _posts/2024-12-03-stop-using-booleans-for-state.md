---
title: Stop Using Booleans for State
layout: post
categories: post
tags:
  - Kotlin
  - Architecture
  - Best Practices
---

A few months ago, I found a bug in production that took me embarrassingly long to track down. Users were seeing a blank screen — no loading spinner, no error message, nothing. Just white. The logs told the story: `isLoading = true` and `isError = true` at the same time. The loading spinner was hidden because the error UI took priority, but the error message was suppressed because the loading state skipped it. Both flags were true, the UI rendered neither, and the user stared at nothing.

The fix was a one-liner — reset `isLoading` to false before setting `isError` to true. But the real problem wasn't the bug. The real problem was that the code allowed that state to exist in the first place. Four booleans sat at the top of my ViewModel: `isLoading`, `isError`, `isEmpty`, `isRetrying`. Four booleans meant 2⁴ = 16 possible combinations. I counted: exactly 4 of those 16 were valid states. The other 12 were bugs waiting to happen, and I'd just found one.

## The Boolean Explosion Problem

Here's the thing — booleans feel like the simplest possible state representation. `isLoading` is either true or false. What could go wrong? Everything, once you add a second boolean.

Two booleans give you 4 combinations. Three give you 8. Four give you 16. The problem isn't the math — it's that most combinations are nonsensical. Can something be loading AND in an error state simultaneously? Can it be empty AND retrying? Your business logic says no, but your type system says sure, go ahead. The compiler won't stop you from writing `isLoading = true; isError = true` any more than it'll stop you from dividing by zero. You're relying entirely on developer discipline to keep states consistent, and discipline doesn't scale across teams, months, or 2 AM hotfixes.

I've seen this pattern in virtually every Android codebase I've worked on. The ViewModel starts clean — one boolean for loading. Then someone adds error handling. Then empty state. Then retry logic. Each addition feels small and harmless, but the combinatorial space grows exponentially while the number of valid states stays roughly constant. By the time you have 4 booleans, 75% of your state space is invalid.

## The Sealed Class Fix

The solution is making invalid states unrepresentable. Instead of four booleans that can combine freely, you define a sealed class where each subclass represents exactly one valid state:

```kotlin
sealed interface UiState<out T> {
    data object Loading : UiState<Nothing>
    data class Success<T>(val data: T) : UiState<T>
    data class Error(val message: String) : UiState<Nothing>
    data object Empty : UiState<Nothing>
    data class Retrying(val previousError: String) : UiState<Nothing>
}
```

Now the ViewModel holds a single `UiState` value instead of four booleans. The states are mutually exclusive by construction — you can't be loading AND in an error state because `Loading` and `Error` are different types. The compiler enforces this at compile time, not at runtime, and not through code review comments that get ignored.

The ViewModel refactor goes from this:

```kotlin
class SearchViewModel(
    private val repository: SearchRepository
) : ViewModel() {
    private val _isLoading = MutableStateFlow(false)
    private val _isError = MutableStateFlow(false)
    private val _isEmpty = MutableStateFlow(false)
    private val _errorMessage = MutableStateFlow("")
    private val _results = MutableStateFlow<List<SearchResult>>(emptyList())

    fun search(query: String) {
        viewModelScope.launch {
            _isLoading.value = true
            _isError.value = false  // easy to forget this line
            _isEmpty.value = false  // and this one
            try {
                val results = repository.search(query)
                _results.value = results
                _isEmpty.value = results.isEmpty()
            } catch (e: Exception) {
                _isError.value = true
                _errorMessage.value = e.message ?: "Unknown error"
            } finally {
                _isLoading.value = false
            }
        }
    }
}
```

To this:

```kotlin
class SearchViewModel(
    private val repository: SearchRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow<UiState<List<SearchResult>>>(UiState.Loading)
    val uiState: StateFlow<UiState<List<SearchResult>>> = _uiState.asStateFlow()

    fun search(query: String) {
        viewModelScope.launch {
            _uiState.value = UiState.Loading
            _uiState.value = try {
                val results = repository.search(query)
                if (results.isEmpty()) UiState.Empty
                else UiState.Success(results)
            } catch (e: Exception) {
                UiState.Error(e.message ?: "Unknown error")
            }
        }
    }
}
```

The boolean version has 5 mutable state fields that need to be kept in sync manually. Every state transition requires resetting the right combination of flags — miss one and you get the blank screen I found in production. The sealed class version has 1 state field, and every transition is a single assignment. There's no "forgetting to reset" because there's nothing to reset. You're replacing the state entirely.

## The "When" Exhaustiveness Trick

One of the most underrated benefits of sealed classes in Kotlin is exhaustive `when` expressions. When you match on a sealed class, the compiler forces you to handle every case:

```kotlin
@Composable
fun SearchScreen(state: UiState<List<SearchResult>>) {
    when (state) {
        is UiState.Loading -> LoadingSpinner()
        is UiState.Success -> SearchResults(state.data)
        is UiState.Error -> ErrorMessage(state.message)
        is UiState.Empty -> EmptyView()
        is UiState.Retrying -> RetryingIndicator(state.previousError)
    }
}
```

If you add a new state — say `UiState.PartialResults` — the compiler immediately flags every `when` expression that doesn't handle it. With booleans, adding a new state means adding a new boolean and then hunting through the entire codebase for every `if (isLoading)` block that might need updating. You'll miss some. The compiler won't help you. The sealed class approach turns a runtime bug hunt into a compile-time checklist.

This matters even more on large teams. When three developers are working on different screens that all consume the same state, adding a new state variant shows up as compiler errors on every screen. No Slack message needed, no "hey don't forget to handle the new state" comment on the PR. The type system does the communication.

## Even Two Booleans Are Suspicious

The sealed class example above covers the obvious case — four booleans that represent a state machine. But I'd go further: even two related booleans should make you pause.

Consider `isEnabled` and `isVisible` on a button. Four combinations exist: enabled+visible, enabled+invisible, disabled+visible, disabled+invisible. Does "enabled but invisible" actually mean anything in your UI? If a button can't be seen, does its enabled state matter? In most cases, these two booleans aren't independent — they represent a single concept like "button availability" that has three meaningful states: shown and active, shown but disabled, or hidden entirely.

```kotlin
sealed interface ButtonState {
    data object Active : ButtonState
    data class Disabled(val reason: String) : ButtonState
    data object Hidden : ButtonState
}
```

Now "enabled but invisible" literally cannot exist. And the `Disabled` state carries a reason, which you'd need a separate string field for in the boolean approach. The sealed class is more expressive AND more constrained — which is exactly what you want from your type system.

The mental model I use is simple: if two booleans are related — meaning changing one might require changing the other — they're probably not independent booleans. They're a state machine in disguise. Pull out the valid combinations, give them names, and use a sealed class. You'll catch bugs at compile time that would otherwise show up in production at 3 AM.

## When Booleans Are Actually Fine

I'm not arguing that you should never use booleans. Some states genuinely have exactly two possibilities with no interaction between them. `isDarkMode` is either true or false, and it doesn't combine with any other state to create invalid combinations. `isMuted` is a simple toggle. `isExpanded` for a collapsible section works fine as a boolean.

The test is straightforward: can this boolean combine with other state in a way that creates an invalid combination? If the answer is no — if it's truly independent — use a boolean. They're simple, they're cheap, and everyone understands them. The moment you notice two or more booleans that share a conceptual relationship, that's your signal to refactor. Don't wait until you find the production bug. I did, and I don't recommend it.

IMO, the cost of over-engineering with a sealed class for a genuine toggle is real — more code, more ceremony. But the cost of under-engineering with booleans for a state machine is much worse — invalid states, inconsistent UI, and bugs that hide behind the combinatorial complexity you created by accident.

## The Reframe: State Shape Is a Design Decision

Here's what I didn't understand early in my career: **the shape of your state is an architectural decision, not just a data modeling convenience**. When you choose booleans, you're choosing to trust developers to maintain invariants manually. When you choose sealed classes, you're encoding those invariants into the type system and letting the compiler maintain them for you.

This is the same principle behind Kotlin's null safety. Before Kotlin, Java developers used `@Nullable` annotations and code review to prevent null pointer exceptions. Kotlin made null a type-level concern. The result wasn't just fewer NPEs — it fundamentally changed how developers thought about optional values. Sealed classes do the same thing for state. They move the invariant enforcement from "developer discipline" to "compiler guarantee."

Theo Browne made a great point about this in his "Stop using booleans" talk: booleans are the `null` of state management. They seem fine until they interact, and then they create a space of possibilities that you never intended. The fix isn't more careful programming. The fix is better types.

I now treat boolean proliferation as a code smell. When I see a PR that adds a third boolean to a ViewModel, I ask: "What states are valid here?" And almost every time, the answer leads to a sealed class that's cleaner, safer, and easier to reason about than the boolean soup it replaces.

Thank You!
