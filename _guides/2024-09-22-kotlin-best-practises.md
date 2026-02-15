---
title: Kotlin Best Practises Guide
layout: post
sequence: 13
categories: post
tags:
  - Android
  - Kotlin
  - Best Practices
---

A couple of years ago, I was reviewing a pull request from a teammate who had just migrated from Java. The code worked fine — all tests passed, no crashes — but it read like Java wearing a Kotlin costume. Nullable types everywhere with `!!` sprinkled like confetti, scope functions used in places that made the code harder to read, and extension functions that should've been member functions. I realized that writing *idiomatic* Kotlin isn't something you just pick up by switching file extensions. It takes deliberate practice and a solid understanding of what the language actually gives you.

Since then, I've built up a set of practices that I rely on across every Android project I work on. These aren't theoretical — they come from real production code, real code reviews, and real bugs that taught me lessons the hard way. I want to walk through the patterns that have genuinely improved my Kotlin code, from scope functions all the way to error handling.

## Scope Functions Done Right

Scope functions — `let`, `run`, `with`, `apply`, and `also` — are probably the most overused and misused feature in Kotlin. Here's the thing: every scope function does roughly the same thing (executes a block of code on an object), but each one communicates a different *intent*. The moment you use the wrong one, you make the reader work harder to understand your code.

I follow a simple mental model. Use **`apply`** when you're configuring an object — you're calling setters or mutating properties and you want the object itself back. Use **`also`** for side effects like logging or validation where you need the object but don't want to transform it. Use **`let`** for nullable transformations — it's the natural partner to the safe call operator. Use **`run`** when you need the receiver's context but care about the return value, not the receiver. And **`with`** is just `run` without the null safety, so I use it when I have a non-null object and want to call multiple methods on it.

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

## Extension Functions — Power and Restraint

Extension functions are one of Kotlin's best features, but they're also an easy way to create an unmaintainable mess. I've seen codebases where every utility function was an extension, including things like `String.toUserId()` that had nothing to do with strings conceptually. The rule I follow: an extension function should feel like it *belongs* on that type. If you have to explain why it's an extension instead of a regular function, it probably shouldn't be one.

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

Also worth noting: extension functions are resolved **statically**, not dynamically. If you define an extension on a parent class and call it on a subclass reference, you get the parent's extension. This catches people off guard when they expect polymorphic dispatch. For that, you need member functions.

## Null Safety Beyond the Basics

Everyone knows about `?.` and `?:`, but IMO the real craft of null safety is knowing *where* in your codebase nullability should even exist. My approach: push null checks to the boundary of your system — network responses, database queries, intent extras — and make your internal domain models non-null. Once data enters your domain layer, it should be validated and safe.

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

For **platform types** — those `!` types you get from Java interop — never let them leak into your Kotlin code without explicit nullability annotations. If you're calling a Java method that returns `String!`, assign it to either `String` or `String?` immediately. Leaving it ambiguous means the compiler can't help you, and you're back to runtime crashes. I've seen production ANRs caused by exactly this — a Java SDK returning null when the Kotlin code assumed non-null.

## Coroutines and Structured Concurrency

The single most important thing about Kotlin coroutines isn't `suspend` or `async` — it's **structured concurrency**. Every coroutine must have a scope, and that scope must be tied to a lifecycle. When I see `GlobalScope.launch` in a codebase, it tells me the author doesn't understand this principle. GlobalScope means "live forever and leak everything."

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

For **dispatchers**, the rule is simple: `Dispatchers.IO` for disk and network, `Dispatchers.Default` for CPU-heavy computation, and never explicitly use `Dispatchers.Main` in a ViewModel because `viewModelScope` already uses it. But here's something people miss — if your repository already switches to `Dispatchers.IO` internally (as it should via `withContext`), you don't need to specify a dispatcher at the call site. Let each layer handle its own dispatcher. This is the principle of **main safety**.

## Collection Operations That Scale

Kotlin's collection API is rich, but there's a performance trap hiding in plain sight. Every `map`, `filter`, and `flatMap` on a regular `List` creates a new intermediate list. For small collections, this doesn't matter. But when you're chaining three or four operations on a list of 10,000 items, you're allocating three or four temporary lists that exist only to be garbage collected. This is where **sequences** come in.

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

Beyond sequences, **`groupBy`** is underrated. I use it constantly for transforming flat API responses into UI-ready structures — grouping transactions by date, messages by sender, or search results by category. And **destructuring** with `map` makes collection code much more readable — `map { (key, value) -> }` instead of `map { it.key to it.value }`.

## Inline Functions — When They Actually Help

The `inline` keyword gets thrown around a lot, but it's not free magic. When you inline a function, the compiler copies the function body into every call site. For higher-order functions that take lambdas, this eliminates the lambda object allocation — which is genuinely useful. But if you inline a function that doesn't take a lambda parameter, you're just making your bytecode bigger for no benefit.

**Reified type parameters** are the other big reason to use inline. Normally, generics are erased at runtime — you can't write `T::class`. But with an inline function, the type parameter is preserved because the code is copied to the call site where the concrete type is known.

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

## Sealed Classes and Exhaustive When

If you're using an `enum` and each variant carries different data, you want a **sealed class** instead. Enums give you a fixed set of values where every instance looks the same. Sealed classes give you a fixed set of *types* where each can have its own properties and behavior. This distinction matters for modeling UI state, navigation events, and result types.

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

The real power is that **`when` is exhaustive** on sealed types. If you add a new subtype and forget to handle it somewhere, the compiler tells you. With enums, you get this too, but sealed classes let each branch carry different data. Since Kotlin 1.5, **sealed interfaces** let you have sealed hierarchies that a class can implement alongside other interfaces — something sealed classes can't do because of single inheritance.

## Data Classes — Use Wisely

Data classes auto-generate `equals()`, `hashCode()`, `toString()`, `copy()`, and `componentN()` functions. They're great for DTOs, domain models, and state objects. But they come with assumptions people forget about. Every property in the primary constructor participates in `equals()` and `hashCode()`. If you add a property in the body, it's invisible to equality checks, which leads to subtle bugs.

Don't use data classes for entities with identity semantics — like a `User` that should be equal based on `id` alone, not every field. And be careful with `copy()` on objects that have mutable state or deep object graphs. `copy()` is shallow — it copies references, not values. If your data class holds a `MutableList`, the original and the copy share the same list instance. IMO, data classes should always hold immutable data.

## Delegation Patterns

Kotlin's `by` keyword is one of those features that dramatically reduces boilerplate once you understand it. **`by lazy`** is the most common — it defers initialization until first access and is thread-safe by default. I use it in Activities and Fragments for expensive objects like database instances or shared preferences. It shaves real milliseconds off startup time because you're not initializing things you might never use.

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

## Error Handling With the Result Type

Kotlin's **`Result`** type and **`runCatching`** give you a functional way to handle errors without try-catch blocks spreading through your business logic. `runCatching` wraps the execution and returns a `Result<T>` that's either a success with the value or a failure with the exception. You can then chain `map`, `recover`, `getOrElse`, and `fold` on it.

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

But here's my honest take — `Result` works well for simple success/failure, but for complex error hierarchies where different errors need different handling, I prefer **sealed error types**. A sealed class like `PaymentError` with subtypes for `NetworkError`, `ValidationError`, and `AuthError` gives you exhaustive `when` matching and carries error-specific data. I use `Result` at the boundary (network calls, disk IO) and sealed types for domain-level errors. They complement each other.

Thank You!
