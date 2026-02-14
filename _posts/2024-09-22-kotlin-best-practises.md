---
title: Kotlin Best Practises Guide
layout: post
categories: post
tags:
  - Android
  - Kotlin
  - Best Practices
---

A couple of years ago, I was reviewing a pull request from a teammate who had just migrated from Java. The code worked fine — all tests passed, no crashes — but it read like Java wearing a Kotlin costume. Nullable types everywhere with `!!` sprinkled like confetti, scope functions used in places that made the code harder to read, and extension functions that should've been member functions.

Here's the thing: writing *idiomatic* Kotlin isn't something you just pick up by switching file extensions. It's like switching from driving an automatic to a manual — sure, you can technically move forward by grinding every gear, but you're not really driving it the way it's meant to be driven. It takes deliberate practice and a real understanding of what the language actually gives you.

Since then, I've built up a set of practices that I rely on across every Android project I work on. These aren't theoretical — they come from real production code, real code reviews, and real bugs that taught me lessons the hard way. I want to walk through the patterns that have genuinely improved my Kotlin code, from scope functions all the way to error handling.

## Scope Functions Done Right

Scope functions — `let`, `run`, `with`, `apply`, and `also` — are probably the most overused and misused feature in Kotlin. Think of them like kitchen knives: a chef's knife, a paring knife, a bread knife — they all cut things, but you wouldn't use a bread knife to dice an onion. Every scope function executes a block of code on an object, but each one communicates a different *intent*. The moment you use the wrong one, you make the reader work harder to understand your code.

I follow a simple mental model. Use **`apply`** when you're configuring an object — you're calling setters or mutating properties and you want the object itself back. Use **`also`** for side effects like logging or validation where you need the object but don't want to transform it. Use **`let`** for nullable transformations — it's the natural partner to the safe call operator. Use **`run`** when you need the receiver's context but care about the return value, not the receiver. And **`with`** is just `run` without the null safety, so I use it when I have a non-null object and want to call multiple methods on it.

That sounds like a lot to memorize. But honestly, once it clicks, it becomes second nature — like knowing which drawer the forks go in. You just *know*.

```kotlin
// apply — configuring an object and returning it
val notification = NotificationCompat.Builder(context, CHANNEL_ID).apply {
    setContentTitle("Download Complete")
    setContentText("Your file is ready")
    setSmallIcon(R.drawable.ic_download)
    setPriority(NotificationCompat.PRIORITY_DEFAULT)
    setAutoCancel(true)
}.build()

// let — safe transformation on nullable
val displayName = currentUser?.let { user ->
    "${user.firstName} ${user.lastName}"
} ?: "Guest"

// also — side effects without changing the chain
fun fetchUserProfile(userId: String): UserProfile {
    return repository.getProfile(userId).also { profile ->
        analytics.trackProfileView(profile.id)
        cache.store(profile)
    }
}
```

One common mistake I see: chaining three or four scope functions together. If you find yourself writing `object.let { }.run { }.also { }`, stop. That's unreadable. One scope function per chain is my rule. Two if you absolutely must. Beyond that, use local variables.

> **🔥 Real talk:** I once spent 20 minutes tracing a bug through a chain of four nested scope functions. The fix was a one-liner — but finding it felt like untangling Christmas lights. If future-you can't read it in 5 seconds, it's too clever.

## Extension Functions — Power and Restraint

Extension functions are one of Kotlin's best features, but they're also an easy way to create an unmaintainable mess. I've seen codebases where every utility function was an extension, including things like `String.toUserId()` that had nothing to do with strings conceptually. Sounds weird, right? A String doesn't know what a "user ID" is.

Here's the rule I follow: an extension function should feel like it *belongs* on that type. It's like adding a new room to a house — it should match the architecture. If you're bolting a spaceship cockpit onto a bungalow, something went wrong. If you have to explain why it's an extension instead of a regular function, it probably shouldn't be one.

Use extensions when you're adding behavior to a type you don't own — Android framework classes, third-party library types, or standard library types. Don't use them for complex business logic that happens to take a particular type as input. That belongs in a service or a use case, not hanging off `String` or `List`.

```kotlin
// Good — genuinely extends View behavior
fun View.fadeIn(duration: Long = 300L) {
    alpha = 0f
    visibility = View.VISIBLE
    animate().alpha(1f).setDuration(duration).start()
}

// Good — makes Fragment operations cleaner
fun Fragment.showErrorSnackbar(message: String) {
    view?.let { rootView ->
        Snackbar.make(rootView, message, Snackbar.LENGTH_LONG).show()
    }
}

// Bad — business logic pretending to be an extension
// This should be a function in a UserValidator class
fun String.isValidEmployeeId(): Boolean {
    return length == 8 && startsWith("EMP") && substring(3).all { it.isDigit() }
}
```

Now here's where it gets interesting. Extension functions are resolved **statically**, not dynamically. What does that actually mean? Imagine you define an extension on `Animal` and another on `Dog` (which extends `Animal`). If you have a variable typed as `Animal` but holding a `Dog` instance, you get the `Animal` extension — not the `Dog` one. This catches people off guard when they expect polymorphic dispatch. For that, you need member functions.

## Null Safety Beyond the Basics

Everyone knows about `?.` and `?:`, but IMO the real craft of null safety is knowing *where* in your codebase nullability should even exist.

Think of your app like an airport. The messy, unpredictable outside world — network responses, database queries, intent extras — that's the arrivals terminal. Anything can show up. Nulls, weird formats, missing data. But once a passenger clears security and enters the terminal, they've been validated. My approach is the same: push null checks to the boundary of your system and make your internal domain models non-null. Once data enters your domain layer, it should be validated and safe.

**`requireNotNull`** is your friend at these boundaries. It throws an `IllegalArgumentException` with a clear message, which is infinitely better than `!!` which gives you a bare `NullPointerException` with no context. I reserve `!!` exclusively for cases where I can prove the value is non-null but the compiler can't — and I leave a comment explaining why.

```kotlin
// At the boundary — validate and fail fast with context
fun handleDeepLink(intent: Intent): DeepLinkParams {
    val rawUri = requireNotNull(intent.data) {
        "DeepLink intent must contain a URI, received: $intent"
    }
    val userId = requireNotNull(rawUri.getQueryParameter("user_id")) {
        "DeepLink URI missing required user_id parameter: $rawUri"
    }
    return DeepLinkParams(userId = userId, uri = rawUri)
}
```

> **🧠 Think about it:** If you grep your codebase right now for `!!`, how many of those usages have a comment explaining *why* the value can't be null? If the answer is "none" — that's a ticking time bomb.

For **platform types** — those `!` types you get from Java interop — never let them leak into your Kotlin code without explicit nullability annotations. If you're calling a Java method that returns `String!`, assign it to either `String` or `String?` immediately. Leaving it ambiguous means the compiler can't help you, and you're back to runtime crashes. I've seen production ANRs caused by exactly this — a Java SDK returning null when the Kotlin code assumed non-null.

## Coroutines and Structured Concurrency

The single most important thing about Kotlin coroutines isn't `suspend` or `async` — it's **structured concurrency**. Every coroutine must have a scope, and that scope must be tied to a lifecycle.

Here's an analogy that might help. Think of coroutines like employees in a company. Structured concurrency means every employee reports to a manager. When the manager leaves, everyone on the team goes home too. Now imagine `GlobalScope.launch` — that's hiring a contractor with no manager, no team, no termination date. They just... keep working. Forever. When I see `GlobalScope.launch` in a codebase, it tells me the author doesn't understand this principle. GlobalScope means "live forever and leak everything."

In Android, use `viewModelScope` or `lifecycleScope`. For custom scopes, create them with `SupervisorJob` so one child failure doesn't cancel siblings. This is critical in ViewModels where you might have multiple independent operations — a failed analytics call shouldn't cancel an ongoing data fetch.

```kotlin
class SearchViewModel(
    private val searchRepository: SearchRepository,
    private val recentSearchDao: RecentSearchDao
) : ViewModel() {

    // SupervisorJob — one failure won't cancel the other
    fun onSearchSubmitted(query: String) {
        viewModelScope.launch {
            // These are independent operations
            val resultsDeferred = async { searchRepository.search(query) }
            val saveDeferred = async { recentSearchDao.insertQuery(query) }

            // If saving recent search fails, we still want results
            try { saveDeferred.await() } catch (e: Exception) {
                Timber.w(e, "Failed to save recent search")
            }

            _searchResults.value = resultsDeferred.await()
        }
    }
}
```

For **dispatchers**, the rule is simple: `Dispatchers.IO` for disk and network, `Dispatchers.Default` for CPU-heavy computation, and never explicitly use `Dispatchers.Main` in a ViewModel because `viewModelScope` already uses it. But here's something people miss — if your repository already switches to `Dispatchers.IO` internally (as it should via `withContext`), you don't need to specify a dispatcher at the call site. Let each layer handle its own dispatcher. This is the principle of **main safety** — each function is responsible for being safe to call from the main thread, so callers don't have to worry about it.

## Collection Operations That Scale

Kotlin's collection API is rich, but there's a performance trap hiding in plain sight. Every `map`, `filter`, and `flatMap` on a regular `List` creates a new intermediate list. For small collections, this doesn't matter. But when you're chaining three or four operations on a list of 10,000 items? You're allocating three or four temporary lists that exist only to be garbage collected.

Imagine a factory assembly line. The eager approach (regular collections) is like building a complete car at each station, scrapping it, and rebuilding a slightly different version at the next station. Absurd, right? The lazy approach (**sequences**) is like passing one car through every station before starting the next. No intermediate junk piles. No wasted work.

Sequences evaluate lazily — they process one element through the entire chain before moving to the next. No intermediate collections. I switch to sequences when I have more than two chained operations on a collection that could reasonably grow large.

```kotlin
// Regular collection — creates intermediate lists at each step
val activeUserEmails = users
    .filter { it.isActive }
    .map { it.email }
    .filter { it.endsWith("@company.com") }

// Sequence — single pass, no intermediate allocations
val activeUserEmails = users.asSequence()
    .filter { it.isActive }
    .map { it.email }
    .filter { it.endsWith("@company.com") }
    .toList()
```

Same result, same readability. The only difference? That `.asSequence()` at the top and `.toList()` at the bottom. Two extra calls and you've eliminated all those throwaway intermediate lists.

Beyond sequences, **`groupBy`** is underrated. I use it constantly for transforming flat API responses into UI-ready structures — grouping transactions by date, messages by sender, or search results by category. And **destructuring** with `map` makes collection code much more readable — `map { (key, value) -> }` instead of `map { it.key to it.value }`.

## Inline Functions — When They Actually Help

The `inline` keyword gets thrown around a lot, but it's not free magic. When you inline a function, the compiler copies the function body into every call site. Think of it like a macro in C — the code gets pasted wherever you use it. For higher-order functions that take lambdas, this eliminates the lambda object allocation — which is genuinely useful. But if you inline a function that doesn't take a lambda parameter, you're just making your bytecode bigger for no benefit.

So when *should* you reach for `inline`? Two situations.

First: higher-order functions where you want to avoid the cost of creating a lambda object on every call. Second: **reified type parameters**. Normally, generics are erased at runtime — you can't write `T::class`. But with an inline function, the type parameter is preserved because the code is copied to the call site where the concrete type is known. It's like the difference between a sealed envelope (erased — you can't see what's inside) and a transparent one (reified — the contents are right there).

```kotlin
inline fun <reified T : Fragment> FragmentManager.findOrCreate(
    tag: String,
    factory: () -> T
): T {
    val existing = findFragmentByTag(tag) as? T
    return existing ?: factory().also { fragment ->
        beginTransaction().add(fragment, tag).commit()
    }
}

// Usage — no need to pass Class<T>, reified handles it
val settingsFragment = supportFragmentManager.findOrCreate("settings") {
    SettingsFragment()
}
```

**`crossinline`** and **`noinline`** exist for edge cases. Use `crossinline` when you pass a lambda to another execution context (like a Runnable) inside an inline function — it prevents non-local returns that would break the control flow. Use `noinline` when you need to store the lambda or pass it as an argument to a non-inline function. Also, **value classes** (formerly inline classes) are great for type-safe wrappers around primitives without runtime overhead — wrapping a `String` as `UserId` gives you type safety at compile time with zero allocation cost.

> **⚡ Quick check:** If you have an `inline` function that doesn't take a lambda parameter and doesn't use `reified`, what are you actually gaining? (Spoiler: nothing. You're just bloating your bytecode.)

## Sealed Classes and Exhaustive When

If you're using an `enum` and each variant carries different data, you want a **sealed class** instead. Here's a way to think about it: enums are like a box of identical chocolates — every piece looks the same, just with a different label. Sealed classes are like a mixed box — some are round, some are square, some have nuts, some have caramel. Each variant gets to carry its own unique shape and filling.

Enums give you a fixed set of values where every instance looks the same. Sealed classes give you a fixed set of *types* where each can have its own properties and behavior. This distinction matters for modeling UI state, navigation events, and result types.

```kotlin
sealed interface SearchScreenState {
    data object Loading : SearchScreenState
    data class Results(
        val items: List<SearchItem>,
        val query: String,
        val totalCount: Int
    ) : SearchScreenState
    data class Error(
        val message: String,
        val retryAction: (() -> Unit)? = null
    ) : SearchScreenState
    data object Empty : SearchScreenState
}

fun renderState(state: SearchScreenState) {
    when (state) {
        is SearchScreenState.Loading -> showLoadingSpinner()
        is SearchScreenState.Results -> showResults(state.items, state.totalCount)
        is SearchScreenState.Error -> showError(state.message, state.retryAction)
        is SearchScreenState.Empty -> showEmptyState()
        // No else needed — compiler guarantees exhaustiveness
    }
}
```

The real power is that **`when` is exhaustive** on sealed types. What does that mean in practice? It means the compiler has your back. If you add a new subtype — say, `SearchScreenState.NoConnection` — and forget to handle it somewhere, the compiler refuses to build. It's like having a teammate who reviews every single `when` block for you, automatically, every time you change the hierarchy. With enums, you get this too, but sealed classes let each branch carry different data.

Since Kotlin 1.5, **sealed interfaces** let you have sealed hierarchies that a class can implement alongside other interfaces — something sealed classes can't do because of single inheritance.

## Data Classes — Use Wisely

Data classes auto-generate `equals()`, `hashCode()`, `toString()`, `copy()`, and `componentN()` functions. They're great for DTOs, domain models, and state objects. But they come with assumptions people forget about.

Here's the gotcha: every property in the primary constructor participates in `equals()` and `hashCode()`. If you add a property in the body, it's invisible to equality checks. Imagine two `User` objects with the same constructor properties but different body properties — `equals()` says they're identical. That leads to subtle bugs that are genuinely painful to track down.

Don't use data classes for entities with identity semantics — like a `User` that should be equal based on `id` alone, not every field. And be careful with `copy()` on objects that have mutable state or deep object graphs. `copy()` is shallow — it copies references, not values. If your data class holds a `MutableList`, the original and the copy share the same list instance. It's like photocopying a page that has a sticky note attached — the photocopy shows the note, but if someone moves the original sticky note, the copy doesn't update. Except worse: in this case, moving the sticky note on the copy *also* moves it on the original, because they're literally the same sticky note.

IMO, data classes should always hold immutable data.

## Delegation Patterns

Kotlin's `by` keyword is one of those features that dramatically reduces boilerplate once you understand it. **`by lazy`** is the most common — it defers initialization until first access and is thread-safe by default. Think of it like a vending machine: the snack isn't made until someone puts in a coin. I use `by lazy` in Activities and Fragments for expensive objects like database instances or shared preferences. It shaves real milliseconds off startup time because you're not initializing things you might never use.

```kotlin
class OrderDetailActivity : AppCompatActivity() {

    private val orderId: String by lazy {
        requireNotNull(intent.getStringExtra(EXTRA_ORDER_ID)) {
            "OrderDetailActivity requires EXTRA_ORDER_ID"
        }
    }

    private val viewModel: OrderDetailViewModel by viewModels {
        OrderDetailViewModelFactory(orderId)
    }

    private val priceFormatter: NumberFormat by lazy {
        NumberFormat.getCurrencyInstance(Locale.getDefault())
    }
}
```

**`by map`** is useful for classes that wrap configuration or JSON-like data — your properties delegate to map lookups. **`Delegates.observable`** lets you react to property changes, which is handy for logging state transitions during debugging. And custom delegates via `ReadOnlyProperty` or `ReadWriteProperty` let you extract repeated property patterns — shared preference access, bundle argument extraction, or feature flag checks — into reusable delegates.

> **💡 The "aha" moment:** Delegation isn't just about saving keystrokes. It's about *extracting property behavior into reusable patterns*. Once you write a `SharedPreferenceDelegate`, every shared pref in your app becomes a one-liner declaration — and the read/write/default logic lives in exactly one place.

## Error Handling With the Result Type

Kotlin's **`Result`** type and **`runCatching`** give you a functional way to handle errors without try-catch blocks spreading through your business logic. Imagine try-catch like a big fishing net — you throw it around a huge block of code and hope you catch the right fish. `runCatching` is more like a targeted lure: it wraps one specific operation and returns a `Result<T>` that's either a success with the value or a failure with the exception. You can then chain `map`, `recover`, `getOrElse`, and `fold` on it.

```kotlin
class PaymentProcessor(
    private val paymentGateway: PaymentGateway,
    private val receiptStore: ReceiptStore
) {
    suspend fun processPayment(order: Order): PaymentResult {
        return runCatching { paymentGateway.charge(order.amount, order.paymentMethod) }
            .map { transaction ->
                receiptStore.save(Receipt(order.id, transaction.id))
                PaymentResult.Success(transactionId = transaction.id)
            }
            .recover { exception ->
                when (exception) {
                    is InsufficientFundsException ->
                        PaymentResult.Declined(reason = "Insufficient funds")
                    is NetworkException ->
                        PaymentResult.Failed(retryable = true)
                    else -> throw exception // Don't swallow unknown errors
                }
            }
            .getOrThrow()
    }
}
```

But here's my honest take — `Result` works well for simple success/failure, but for complex error hierarchies where different errors need different handling, I prefer **sealed error types**. A sealed class like `PaymentError` with subtypes for `NetworkError`, `ValidationError`, and `AuthError` gives you exhaustive `when` matching and carries error-specific data. I use `Result` at the boundary (network calls, disk IO) and sealed types for domain-level errors. They complement each other — `Result` catches the exception at the edge, and sealed types give you type-safe, compiler-checked error handling in the core.

Thank You!
