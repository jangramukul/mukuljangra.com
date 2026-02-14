---
title: Jetpack Compose Best Practises Guide
layout: post
categories: post
tags:
  - Android
  - Best Practices
  - Jetpack Compose
---

A few months back, I shipped a feature that looked perfect in debug builds but dropped frames like crazy in release. The profiler told a horror story — recompositions happening hundreds of times per second on composables that had no business recomposing. I had state hoisted wrong, was passing unstable lambdas into lazy lists, and had zero `key` parameters on my `LazyColumn` items.

So I did what any reasonable developer does at 11 PM — I started digging into how the Compose compiler actually decides what to skip and what to recompose. That investigation changed how I write every composable now.

Think of it this way: Compose is like a smart painter. You hand it a wall, and instead of repainting the entire thing every time you change a picture frame, it only repaints the section around that frame. But here's the catch — if you give the painter bad instructions (unstable parameters, misplaced state, unnecessary allocations), it panics and repaints everything. Every frame. That's what was happening to my app.

This post covers the patterns I've landed on after debugging real performance issues in production Compose apps. Not theoretical best practices from docs — these are the things that actually moved the needle when frames were dropping and recompositions were out of control.

## Stability and the Compose Compiler

Here's the thing most developers miss about Compose performance: the real magic happens at **compile time**, not runtime. Before your app even runs, the Compose compiler analyzes every parameter type in every composable and makes a critical judgment call — is this composable **skippable** or **non-skippable**?

If all parameters are **stable** — meaning Compose can reliably compare old and new values — the composable gets the green light to be skipped when nothing changes. But if even one parameter is unstable? The composable recomposes every single time its parent recomposes. Every. Single. Time. Regardless of whether its data actually changed.

It's like a bouncer at a club. If the bouncer can check everyone's ID (stable types), people who were already inside don't need to go through the line again. But if even one person in the group has no ID (unstable type), the bouncer makes the entire group go through the entrance process again. Not great for your frame rate.

So what makes a type "stable"? Primitives, `String`, function types, or classes where all public properties are `val` and themselves stable. Sounds reasonable, right? But here's the catch that gets everyone — `List<T>`, `Map<K,V>`, and `Set<T>` from the Kotlin standard library are **not stable**. They're interfaces, and the compiler can't guarantee the underlying implementation is truly immutable. Someone could pass you a `MutableList` disguised as a `List`, and the compiler knows it.

This is where `@Immutable` and `@Stable` come in. Annotating a data class with `@Immutable` is a promise — a pinky-swear, really — to the compiler that the object and all its properties will never change after construction. `@Stable` is a weaker contract: values can change, but Compose will be notified through the snapshot system when they do.

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

> **🔥 Real talk:** If you're not running Compose compiler reports on your project right now, stop reading this and go enable them. Seriously. I'll wait. The number of "oh no" moments you'll have looking at those reports for the first time is... educational.

## Lambda Allocations and Method References

Every time you pass a lambda to a composable, Kotlin allocates an object for it. Now, before you panic and start wrapping every lambda in `remember` — relax. In most places this is totally fine. The Compose compiler is smart enough to wrap lambdas with `remember` automatically when it can prove they haven't changed.

But there are cases where it can't, especially when lambdas capture mutable local variables or unstable parameters. And here's where it matters: imagine a `LazyColumn` with hundreds of items. Each item gets a click handler lambda. Each recomposition creates a fresh lambda object for every item. That's hundreds of tiny garbage objects being created and thrown away, over and over. Your garbage collector is not going to send you a thank-you card.

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

`remember` is probably the most used and most misunderstood API in Compose. I'd argue it's the source of more subtle bugs than any other Compose API, because it *looks* simple but has surprisingly different flavors.

Think of `remember` like different types of storage in your house. The base `remember { }` is like your kitchen counter — stuff stays there while you're cooking (across recompositions), but when you renovate (configuration change) or the house floods (process death), it's gone. `remember(key) { }` is the same counter, but you swap what's on it whenever you change the recipe (the key changes). `rememberSaveable` is like a fireproof safe — it survives the renovation because it serializes the value into the saved instance state bundle. And for complex objects that don't fit in the safe? You write a custom `Saver` — basically instructions for how to pack and unpack your stuff.

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

> **🧠 Think about it:** You have a shopping cart screen where users can type a promo code. Should the promo code text survive a screen rotation? What about the "promo applied successfully" banner — should that survive too? The answer tells you which `remember` variant to use for each piece of state.

## State Hoisting Done Right

State hoisting means moving state ownership **up** to the caller and passing the current value plus callbacks **down** to the composable. The composable becomes **stateless** — it renders whatever it's told and fires events when the user interacts.

If you've ever worked with a TV remote, you already understand state hoisting. The remote (your composable) doesn't decide what channel you're on — it just shows buttons and tells the TV (the parent) when you press one. The TV owns the state. The remote is stateless. That's it. That's state hoisting.

This is the foundation of testable and reusable Compose code. I think of it as the same principle as unidirectional data flow in MVI architectures, just applied at the composable level.

The question most people get wrong is **how far up** to hoist. The rule I follow: hoist state to the lowest common ancestor that needs it. If only one screen uses a search query, keep it in that screen's state holder. If multiple screens need the same filter, hoist it to a shared ViewModel. Don't hoist everything into a god-ViewModel — that defeats the purpose and turns your architecture into a tangled mess where changing one screen's state can accidentally break another.

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

`derivedStateOf` creates a state object that only triggers recomposition when its **computed result** changes, not when its inputs change. This is powerful when you have a frequently-changing source state but a less-frequently-changing derived value.

Here's an analogy. Imagine you have a weather station that reports the temperature every second. You don't care about every single reading — you only care when the temperature crosses a threshold, like going above freezing. `derivedStateOf` is like setting up an alert that only fires when the temperature crosses that line, not on every single reading. The classic code example: a list that changes often, but a boolean "is list empty" that only changes twice — when the first item arrives and when the last item is removed. Perfect use case.

But here's where people go wrong — using `derivedStateOf` when a simple `remember(key)` would work. If your derived value changes every time the input changes, `derivedStateOf` adds overhead for zero benefit. It creates a snapshot state reader, registers observers, and runs a comparison on every read. Only use it when you genuinely expect the output to change less often than the input.

I've reviewed PRs where developers wrapped every computation in `derivedStateOf` thinking it was an optimization — it actually made things slower because every derived value changed 1:1 with its input. Using `derivedStateOf` when the output always changes with the input is like installing a "has the light changed?" sensor on a light switch you're flipping yourself. You already know it changed. You're the one who changed it.

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

> **⚡ Quick check:** You have a text field and you want to show "X characters remaining" below it. Would you use `derivedStateOf` or `remember(key)` for the character count? (Hint: does the count change less often than the input?)

## Recomposition — How Skipping Actually Works

The Compose runtime uses **smart recomposition** to skip composables whose inputs haven't changed. When a state value changes, Compose invalidates only the scope that reads it and walks down the tree, comparing parameters at each composable call site. If all parameters pass an equality check and the composable is marked skippable by the compiler, it's skipped entirely.

This is why stability matters so much — and why I put that section first in this post. Unstable parameters can't be compared, so the composable always recomposes. It's like trying to ask the bouncer "is this the same person who came in earlier?" but the person has no ID. The bouncer shrugs and makes them go through the whole process again. Every time.

To debug recomposition issues, the **Layout Inspector** in Android Studio is your best friend. Enable "Show Recomposition Counts" and you'll see exactly how many times each composable recomposes and how many times it skips. In one project, I found a `Card` composable recomposing 400+ times during a scroll because it received a `Context` parameter — which is inherently unstable. Moving the `Context` access inside the composable and removing it from the parameter list brought recompositions down to near zero. The Layout Inspector paid for itself in about five minutes.

## LazyColumn Performance

`LazyColumn` is where Compose performance problems become most visible because you're dealing with potentially hundreds of composables being created, measured, and recycled. If stability issues are a slow leak, `LazyColumn` performance issues are a burst pipe. You notice them immediately.

Three things matter most. First, always provide a **stable `key`** for every item — without it, Compose treats items as positional and recomposes everything when the list changes. It's like a school classroom where kids don't have assigned seats. Every time one kid leaves, everyone has to shuffle around and figure out where to sit again. With `key`, each kid has their own seat. Only the kid who left needs to be dealt with.

Second, use **`contentType`** when your list has mixed item types (headers, items, ads) so the lazy layout can reuse compositions of the same type. Third, make sure your item data classes are **stable** so individual items can skip recomposition when their data hasn't changed.

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

One thing I see constantly: people doing heavy computations inside `items { }` blocks. Every expensive operation in there runs during composition on the main thread. Move formatting, filtering, and sorting into the ViewModel. The `LazyColumn` should receive pre-computed, ready-to-render data. Your composable is a waiter delivering plates to the table — it shouldn't be back in the kitchen chopping onions.

## CompositionLocal for Implicit Dependencies

`CompositionLocal` lets you pass values down the composable tree implicitly without threading them through every function signature. The most common built-in examples are `LocalContext`, `LocalDensity`, and `LocalConfiguration`. For custom values, it's great for cross-cutting concerns like theming tokens, spacing scales, or analytics trackers that dozens of composables need but you don't want to pass as parameters everywhere.

Think of `CompositionLocal` like the WiFi in your house. Every device (composable) can access it without you running an ethernet cable (parameter) to each one. But here's the tradeoff — if someone asks "what does this device need to work?", WiFi is an invisible dependency. You can't tell just by looking at the device.

Same thing with composables. When a composable reads from `CompositionLocal`, it has an implicit dependency that isn't visible in its signature. This makes previews harder and tests more verbose because you need to wrap everything in `CompositionLocalProvider`. I use `CompositionLocal` for genuinely ambient values — theme, navigation, density — and explicit parameters for everything else.

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

Side effects in Compose are operations that happen **outside** the composable's scope — network calls, analytics events, listener registration, coroutine launches. Compose provides specific APIs for each scenario, and using the wrong one leads to subtle bugs that'll have you questioning your career choices at 2 AM.

Here's how I think about it. Imagine your composable is a stage actor. The actor's job is to perform the script (render UI). But sometimes the actor needs to do things off-stage — set up props, cue the sound effects, clean up after the scene. Those are side effects. And just like theater has specific crew members for each backstage job, Compose has specific APIs.

**`LaunchedEffect`** launches a coroutine tied to the composable's lifecycle — it cancels when the composable leaves composition, and restarts when its keys change. **`DisposableEffect`** is for non-coroutine cleanup — registering and unregistering listeners, callbacks, or observers. **`SideEffect`** runs after every successful recomposition with no lifecycle awareness — useful for syncing Compose state to non-Compose code.

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

> **💡 The "aha" moment:** The key insight with side effects is that Compose can call your composable function multiple times, skip it, or reorder it. Side effect APIs exist precisely because you need a way to say "do this thing exactly once" or "clean this up when I'm done" in a world where your function might run ten times in a second.

## Profiling and Real-World Performance Patterns

Compose performance optimization should be **measurement-driven**, not guesswork. I cannot stress this enough. Guessing where your performance problems are is like a doctor diagnosing patients by looking at them from across the room. You need the instruments.

The Compose compiler metrics tell you about stability issues at build time. The Layout Inspector shows recomposition counts at runtime. And **Macrobenchmark** gives you actual frame timing data in release builds — which is the only number that truly matters, because debug builds disable most compiler optimizations. I've seen apps that felt sluggish in debug run buttery smooth in release. Don't profile debug builds and draw conclusions.

The most common performance killers I've seen in production: unstable data classes passed into `LazyColumn` items (fix with `@Immutable` and `ImmutableList`), reading `ViewModel` state at too high a level so the entire screen recomposes on every change (fix by reading state as close to the usage site as possible), and doing work in composition that belongs in the ViewModel (string formatting, list filtering, date calculations). Every one of these is invisible without profiling tools. To me, running Compose compiler reports should be as routine as running lint — do it on every PR and you'll catch stability regressions before they ship.

Thank You!
