---
title: Jetpack Compose Best Practises Guide
layout: post
categories: post
tags:
  - Android
  - Best Practices
  - Jetpack Compose
---

A few months back, I shipped a feature that looked perfect in debug builds but dropped frames like crazy in release. The profiler showed recompositions happening hundreds of times per second on composables that had no business recomposing. I had state hoisted wrong, was passing unstable lambdas into lazy lists, and had zero `key` parameters on my `LazyColumn` items. Fixing it meant going back and understanding how the Compose compiler actually decides what to skip and what to recompose. That investigation changed how I write every composable now.

This post covers the patterns I've landed on after debugging real performance issues in production Compose apps. Not theoretical best practices from docs — these are the things that actually moved the needle when frames were dropping and recompositions were out of control.

## Stability and the Compose Compiler

Here's the thing most developers miss about Compose performance: the compiler does a lot of work **before** runtime to decide which composables can be skipped during recomposition. It analyzes every parameter type and marks composables as either **skippable** or **non-skippable**. If all parameters are **stable** — meaning Compose can reliably compare old and new values — the composable gets skipped when nothing changes. If even one parameter is unstable, the composable recomposes every single time its parent recomposes, regardless of whether its data actually changed.

A type is considered stable if it's a primitive, a `String`, a function type, or a class where all public properties are `val` and themselves stable. The catch is that `List<T>`, `Map<K,V>`, and `Set<T>` from the Kotlin standard library are **not stable** because they're interfaces — the compiler can't guarantee the underlying implementation is truly immutable. This is where `@Immutable` and `@Stable` come in. Annotating a data class with `@Immutable` is a promise to the compiler that the object and all its properties will never change after construction. `@Stable` is a weaker contract — values can change, but Compose will be notified through the snapshot system when they do.

```kotlin
// This data class is unstable because List is not stable
data class FeedState(
    val posts: List<PostItem>,
    val isLoading: Boolean
)

// Fix 1: Use @Immutable when the data truly never mutates
@Immutable
data class FeedState(
    val posts: ImmutableList<PostItem>,
    val isLoading: Boolean
)

// Fix 2: Use @Stable when the class participates in snapshot state
@Stable
class SearchFilter(
    val query: String,
    val category: Category,
    val sortOrder: SortOrder
)
```

IMO, the first thing you should do on any Compose project is enable the Compose compiler reports (`-P plugin:androidx.compose.compiler.plugins.kotlin:reportsDestination=...`). These reports show you exactly which composables are skippable and which parameters are unstable. I've seen entire screens recomposing on every frame because a single `List` parameter made the whole composable non-skippable. The fix took 30 seconds — adding `@Immutable` and switching to `kotlinx.collections.immutable` — but finding the problem without compiler reports would have taken hours.

## Lambda Allocations and Method References

Every time you pass a lambda to a composable, Kotlin allocates an object for it. In most places this is fine — the Compose compiler is smart enough to wrap lambdas with `remember` automatically when it can prove they haven't changed. But there are cases where it can't, especially when lambdas capture mutable local variables or unstable parameters. In a `LazyColumn` with hundreds of items, allocating a new lambda object for every item on every recomposition adds up fast.

The fix depends on context. For event callbacks that don't capture changing state, method references avoid allocations entirely. For lambdas that capture stable values, wrapping with `remember` ensures the same instance is reused across recompositions. But don't over-optimize — I've seen codebases where every lambda is wrapped in `remember` even when it captures nothing. That adds complexity with zero benefit because the compiler already handles those cases.

```kotlin
// Bad: new lambda allocation on every recomposition of every item
@Composable
fun TransactionList(
    transactions: ImmutableList<Transaction>,
    viewModel: TransactionViewModel
) {
    LazyColumn {
        items(transactions, key = { it.id }) { transaction ->
            TransactionRow(
                transaction = transaction,
                // This creates a new lambda every recomposition
                onArchive = { viewModel.archive(transaction.id) }
            )
        }
    }
}

// Better: remember the callback with a stable key
@Composable
fun TransactionRow(
    transaction: Transaction,
    onArchive: (String) -> Unit
) {
    val callback = remember(transaction.id) { { onArchive(transaction.id) } }
    Row(modifier = Modifier.clickable(onClick = callback)) {
        Text(transaction.description)
    }
}
```

## Remember Patterns — Choosing the Right One

`remember` is probably the most used and most misunderstood API in Compose. The base `remember { }` caches a value across recompositions but loses it on configuration changes and process death. `remember(key) { }` recalculates when the key changes — essential for derived values that depend on parameters. `rememberSaveable` survives configuration changes by serializing the value into the saved instance state bundle. And for complex objects that aren't easily serializable, you write a custom `Saver`.

The decision tree is straightforward. If the value is purely a UI computation like a formatted string or a calculated layout value, use `remember`. If it's user-entered data or navigation state that should survive rotation, use `rememberSaveable`. If the object is complex — say, a custom selection state with multiple fields — write a `Saver` that maps it to and from a `Bundle`-compatible format.

```kotlin
@Composable
fun PaymentForm() {
    // Survives recomposition only
    val formatter = remember { CurrencyFormatter(Locale.getDefault()) }

    // Survives configuration changes
    var amount by rememberSaveable { mutableStateOf("") }

    // Recalculates when amount changes
    val isValid = remember(amount) {
        amount.toDoubleOrNull()?.let { it > 0 } ?: false
    }

    // Custom Saver for complex state
    val dateRange by rememberSaveable(saver = DateRangeSaver) {
        mutableStateOf(DateRange.thisMonth())
    }
}

object DateRangeSaver : Saver<MutableState<DateRange>, List<Long>> {
    override fun save(value: MutableState<DateRange>): List<Long> =
        listOf(value.value.startMillis, value.value.endMillis)

    override fun restore(value: List<Long>): MutableState<DateRange> =
        mutableStateOf(DateRange(value[0], value[1]))
}
```

## State Hoisting Done Right

State hoisting means moving state ownership **up** to the caller and passing the current value plus callbacks **down** to the composable. The composable becomes **stateless** — it renders whatever it's told and fires events when the user interacts. This is the foundation of testable and reusable Compose code. I think of it as the same principle as unidirectional data flow in MVI architectures, just applied at the composable level.

The question most people get wrong is **how far up** to hoist. The rule I follow: hoist state to the lowest common ancestor that needs it. If only one screen uses a search query, keep it in that screen's state holder. If multiple screens need the same filter, hoist it to a shared ViewModel. Don't hoist everything into a god-ViewModel — that defeats the purpose.

```kotlin
// Stateless composable — easy to preview, test, and reuse
@Composable
fun SearchBar(
    query: String,
    onQueryChange: (String) -> Unit,
    onSearch: () -> Unit,
    modifier: Modifier = Modifier
) {
    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        placeholder = { Text("Search products...") },
        trailingIcon = {
            IconButton(onClick = onSearch) {
                Icon(Icons.Default.Search, contentDescription = "Search")
            }
        },
        modifier = modifier.fillMaxWidth()
    )
}

// Stateful wrapper that owns the state
@Composable
fun SearchScreen(viewModel: SearchViewModel = viewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    SearchBar(
        query = uiState.query,
        onQueryChange = viewModel::updateQuery,
        onSearch = viewModel::performSearch
    )
}
```

## Derived State and When NOT to Use It

`derivedStateOf` creates a state object that only triggers recomposition when its **computed result** changes, not when its inputs change. This is powerful when you have a frequently-changing source state but a less-frequently-changing derived value. The classic example: a list that changes often, but a boolean "is list empty" that only changes twice — when the first item arrives and when the last item is removed.

But here's where people go wrong — using `derivedStateOf` when a simple `remember(key)` would work. If your derived value changes every time the input changes, `derivedStateOf` adds overhead for zero benefit. It creates a snapshot state reader, registers observers, and runs a comparison on every read. Only use it when you genuinely expect the output to change less often than the input. I've reviewed PRs where developers wrapped every computation in `derivedStateOf` thinking it was an optimization — it actually made things slower because every derived value changed 1:1 with its input.

```kotlin
@Composable
fun NotificationBadge(notifications: ImmutableList<Notification>) {
    // Good: hasUnread changes far less often than the list itself
    val hasUnread by remember {
        derivedStateOf { notifications.any { !it.isRead } }
    }

    // Bad: count changes every time the list changes — just use remember
    // val count by remember { derivedStateOf { notifications.size } }
    // Better:
    val count = remember(notifications) { notifications.size }

    if (hasUnread) {
        Badge { Text(count.toString()) }
    }
}
```

## Recomposition — How Skipping Actually Works

The Compose runtime uses **smart recomposition** to skip composables whose inputs haven't changed. When a state value changes, Compose invalidates only the scope that reads it and walks down the tree, comparing parameters at each composable call site. If all parameters pass an equality check and the composable is marked skippable by the compiler, it's skipped entirely. This is why stability matters so much — unstable parameters can't be compared, so the composable always recomposes.

To debug recomposition issues, the **Layout Inspector** in Android Studio is your best friend. Enable "Show Recomposition Counts" and you'll see exactly how many times each composable recomposes and how many times it skips. In one project, I found a `Card` composable recomposing 400+ times during a scroll because it received a `Context` parameter — which is inherently unstable. Moving the `Context` access inside the composable and removing it from the parameter list brought recompositions down to near zero. The Layout Inspector paid for itself in about five minutes.

## LazyColumn Performance

`LazyColumn` is where Compose performance problems become most visible because you're dealing with potentially hundreds of composables being created, measured, and recycled. Three things matter most. First, always provide a **stable `key`** for every item — without it, Compose treats items as positional and recomposes everything when the list changes. Second, use **`contentType`** when your list has mixed item types (headers, items, ads) so the lazy layout can reuse compositions of the same type. Third, make sure your item data classes are **stable** so individual items can skip recomposition when their data hasn't changed.

```kotlin
@Composable
fun OrderHistory(orders: ImmutableList<Order>) {
    LazyColumn {
        items(
            items = orders,
            key = { it.orderId },
            contentType = { it.type }
        ) { order ->
            when (order.type) {
                OrderType.STANDARD -> OrderCard(order)
                OrderType.SUBSCRIPTION -> SubscriptionCard(order)
            }
        }
    }
}

// Stable item data — Compose can skip recomposition per-item
@Immutable
data class Order(
    val orderId: String,
    val type: OrderType,
    val title: String,
    val totalCents: Long,
    val status: OrderStatus
)
```

One thing I see constantly: people doing heavy computations inside `items { }` blocks. Every expensive operation in there runs during composition on the main thread. Move formatting, filtering, and sorting into the ViewModel. The `LazyColumn` should receive pre-computed, ready-to-render data.

## CompositionLocal for Implicit Dependencies

`CompositionLocal` lets you pass values down the composable tree implicitly without threading them through every function signature. The most common built-in examples are `LocalContext`, `LocalDensity`, and `LocalConfiguration`. For custom values, it's great for cross-cutting concerns like theming tokens, spacing scales, or analytics trackers that dozens of composables need but you don't want to pass as parameters everywhere.

The tradeoff is testability and readability. When a composable reads from `CompositionLocal`, it has an implicit dependency that isn't visible in its signature. This makes previews harder and tests more verbose because you need to wrap everything in `CompositionLocalProvider`. I use `CompositionLocal` for genuinely ambient values — theme, navigation, density — and explicit parameters for everything else.

```kotlin
val LocalSpacing = staticCompositionLocalOf<SpacingScale> {
    error("No SpacingScale provided")
}

@Composable
fun AppThemeWrapper(content: @Composable () -> Unit) {
    CompositionLocalProvider(
        LocalSpacing provides SpacingScale.Default
    ) {
        MaterialTheme(content = content)
    }
}

@Composable
fun ProfileHeader(user: User) {
    val spacing = LocalSpacing.current
    Column(modifier = Modifier.padding(spacing.medium)) {
        Text(user.displayName, style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(spacing.small))
        Text(user.bio)
    }
}
```

## Side Effects — The Right Tool for the Job

Side effects in Compose are operations that happen **outside** the composable's scope — network calls, analytics events, listener registration, coroutine launches. Compose provides specific APIs for each scenario, and using the wrong one leads to subtle bugs. **`LaunchedEffect`** launches a coroutine tied to the composable's lifecycle — it cancels when the composable leaves composition, and restarts when its keys change. **`DisposableEffect`** is for non-coroutine cleanup — registering and unregistering listeners, callbacks, or observers. **`SideEffect`** runs after every successful recomposition with no lifecycle awareness — useful for syncing Compose state to non-Compose code.

**`rememberCoroutineScope`** gives you a scope you can launch coroutines from event handlers (like button clicks) rather than from composition itself. This is the right choice when the coroutine should be triggered by a user action, not by the composable appearing on screen.

```kotlin
@Composable
fun LiveLocationTracker(
    locationClient: FusedLocationProviderClient,
    onLocationUpdate: (LatLng) -> Unit
) {
    // Coroutine tied to composable lifecycle
    LaunchedEffect(Unit) {
        locationClient.locationFlow()
            .collect { location ->
                onLocationUpdate(LatLng(location.latitude, location.longitude))
            }
    }

    // Cleanup when composable leaves composition
    DisposableEffect(locationClient) {
        val callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.lastLocation?.let {
                    onLocationUpdate(LatLng(it.latitude, it.longitude))
                }
            }
        }
        locationClient.requestLocationUpdates(
            LocationRequest.create(), callback, Looper.getMainLooper()
        )
        onDispose { locationClient.removeLocationUpdates(callback) }
    }
}
```

## Profiling and Real-World Performance Patterns

Compose performance optimization should be **measurement-driven**, not guesswork. The Compose compiler metrics tell you about stability issues at build time. The Layout Inspector shows recomposition counts at runtime. And **Macrobenchmark** gives you actual frame timing data in release builds — which is the only number that truly matters, because debug builds disable most compiler optimizations.

The most common performance killers I've seen in production: unstable data classes passed into `LazyColumn` items (fix with `@Immutable` and `ImmutableList`), reading `ViewModel` state at too high a level so the entire screen recomposes on every change (fix by reading state as close to the usage site as possible), and doing work in composition that belongs in the ViewModel (string formatting, list filtering, date calculations). Every one of these is invisible without profiling tools. To me, running Compose compiler reports should be as routine as running lint — do it on every PR and you'll catch stability regressions before they ship.

Thank You!
