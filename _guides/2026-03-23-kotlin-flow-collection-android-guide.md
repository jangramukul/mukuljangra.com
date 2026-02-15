---
title: Kotlin Flow Collection in Android Guide
layout: post
sequence: 117
categories: post
tags:
  - Kotlin Coroutines
  - Android
---

Collecting flows in Android UI is deceptively simple to get wrong. You call `flow.collect { }` inside a coroutine, it works in development, you ship it, and then your app drains 15% battery in the background because the collection never stopped. I've debugged this exact issue in a production app — a location flow was collecting GPS updates even when the app was backgrounded, burning through battery and generating analytics events that nobody would ever see.

The core problem is that flows don't know about Android lifecycles. A `Flow` emits values and a coroutine collects them. The coroutine doesn't care if the Activity is visible, backgrounded, or halfway through being destroyed. It keeps collecting until the coroutine is cancelled or the flow completes. That gap between "coroutine is alive" and "UI is visible" is where the bugs live. And the right fix depends on whether you're building with Views or Compose, because the two systems handle lifecycle awareness differently.

## The Problem: Lifecycle-Unaware Collection

The most common first attempt looks like this:

```kotlin
class OrdersActivity : AppCompatActivity() {

    private val viewModel: OrdersViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycleScope.launch {
            viewModel.ordersFlow.collect { orders ->
                updateOrdersList(orders)
            }
        }
    }
}
```

This works — technically. The collection starts in `onCreate`, and `lifecycleScope` cancels the coroutine when the Activity is destroyed. But here's what it doesn't do: it doesn't stop collecting when the app goes to the background. The user presses Home, the Activity moves to `STOPPED`, but the coroutine is still alive. The flow keeps emitting, the collector keeps processing, and if that flow is backed by a network call or database query, you're wasting CPU, battery, and bandwidth on updates the user can't see.

It gets worse with view updates. If the flow emits while the Activity is stopped, you're calling `updateOrdersList` on views that are technically still around but not visible. For Fragments, this is even more dangerous — the Fragment's view can be destroyed while the Fragment itself survives (think back stack), so you end up with a null view reference and a crash.

The fundamental issue is that `lifecycleScope.launch` ties the coroutine to the `DESTROYED` lifecycle event. But for UI updates, you want to tie collection to visibility — start when the UI is visible (`STARTED`), stop when it's not. That's a tighter window, and it's the window that matters.

## repeatOnLifecycle

`repeatOnLifecycle` is the recommended approach for lifecycle-aware flow collection in View-based UI. It's a suspend function from `androidx.lifecycle:lifecycle-runtime-ktx` that takes a `Lifecycle.State` and a suspend block. When the lifecycle reaches the target state, it launches the block in a new coroutine. When the lifecycle drops below that state, it cancels the coroutine. When the lifecycle comes back up, it launches the block again in a fresh coroutine. This start-cancel-restart cycle continues until the lifecycle is destroyed.

Here's the Activity pattern:

```kotlin
class OrdersActivity : AppCompatActivity() {

    private val viewModel: OrdersViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.ordersFlow.collect { orders ->
                    updateOrdersList(orders)
                }
            }
        }
    }
}
```

And the Fragment pattern, which has one important difference — use `viewLifecycleOwner.lifecycleScope` instead of `lifecycleScope`:

```kotlin
class OrdersFragment : Fragment() {

    private val viewModel: OrdersViewModel by viewModels()

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.ordersFlow.collect { orders ->
                    binding.ordersList.adapter = OrdersAdapter(orders)
                }
            }
        }
    }
}
```

In Fragments, the Fragment's lifecycle and the Fragment's view lifecycle are different things. A Fragment on the back stack is still alive (`lifecycleScope` is active), but its view is destroyed. If you use `lifecycleScope` instead of `viewLifecycleOwner.lifecycleScope`, you'll collect flow emissions and try to update a view that no longer exists. I've seen this cause `NullPointerException` crashes in production — the binding is null because `onDestroyView` already ran.

Why `STARTED` and not `RESUMED`? `STARTED` covers the visible-but-not-focused window. When a dialog or a transparent Activity appears on top, your Activity drops from `RESUMED` to `STARTED` but is still partially visible. If you used `RESUMED`, the flow collection would stop every time a dialog pops up, which means your UI state goes stale behind the dialog. `STARTED` keeps the data flowing as long as the user can see the screen. Google's official guidance recommends `STARTED` as the default for flow collection, and after hitting the dialog edge case myself, I agree.

When you need to collect multiple flows, launch each in a separate coroutine inside the `repeatOnLifecycle` block. The block provides a `CoroutineScope`, so you can call `launch` directly:

```kotlin
viewLifecycleOwner.lifecycleScope.launch {
    viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
        launch {
            viewModel.ordersFlow.collect { orders ->
                updateOrdersList(orders)
            }
        }
        launch {
            viewModel.notificationsFlow.collect { count ->
                updateBadge(count)
            }
        }
    }
}
```

Both collections start and stop together, tied to the same lifecycle. This is cleaner than calling `flowWithLifecycle` twice, which I'll cover next.

## flowWithLifecycle

`flowWithLifecycle` is a convenience extension on `Flow` that internally wraps `repeatOnLifecycle`. It returns a new flow that only emits when the lifecycle is at least in the target state. Under the hood, it launches a `repeatOnLifecycle` block and re-emits each value into a new flow.

```kotlin
viewLifecycleOwner.lifecycleScope.launch {
    viewModel.ordersFlow
        .flowWithLifecycle(viewLifecycleOwner.lifecycle, Lifecycle.State.STARTED)
        .collect { orders ->
            updateOrdersList(orders)
        }
}
```

This is slightly less boilerplate for a single flow. But the moment you need two or more flows, `flowWithLifecycle` becomes awkward. Each call creates its own internal `repeatOnLifecycle`, which means separate coroutines, separate lifecycle observations, and more overhead. For multiple flows, use `repeatOnLifecycle` directly with separate `launch` blocks — it's more efficient because there's a single lifecycle observer managing all the coroutines.

I use `flowWithLifecycle` only when I'm chaining operators on a single flow and want to keep the pipeline fluent. For anything more complex, `repeatOnLifecycle` is the better choice.

## Compose: collectAsState and collectAsStateWithLifecycle

In Compose, the API is different but the problem is the same. Compose provides `collectAsState()` to convert a `Flow` into a Compose `State` that triggers recomposition on new values. It's clean and works great — except it doesn't respect the Android lifecycle.

```kotlin
@Composable
fun OrdersScreen(viewModel: OrdersViewModel = viewModel()) {
    // Does NOT respect lifecycle — keeps collecting in background
    val orders by viewModel.ordersFlow.collectAsState(initial = emptyList())

    LazyColumn {
        items(orders) { order ->
            OrderItem(order)
        }
    }
}
```

`collectAsState` starts collecting when the composable enters composition and stops when it leaves composition. But composition is not the same as visibility. A composable stays in composition when the app is backgrounded — it's just not drawing. So the flow keeps emitting, the state keeps updating, and you're doing work for a UI nobody can see.

The fix is `collectAsStateWithLifecycle()` from `androidx.lifecycle:lifecycle-runtime-compose`. This function does exactly what the name says — it collects the flow as a Compose `State`, but it also observes the lifecycle. When the lifecycle drops below `STARTED`, collection stops. When it comes back, collection restarts.

```kotlin
@Composable
fun OrdersScreen(viewModel: OrdersViewModel = viewModel()) {
    // Respects lifecycle — stops collecting when backgrounded
    val orders by viewModel.ordersFlow.collectAsStateWithLifecycle(
        initialValue = emptyList()
    )

    LazyColumn {
        items(orders) { order ->
            OrderItem(order)
        }
    }
}
```

One function call, one line of difference, and your app stops wasting resources in the background. Internally, `collectAsStateWithLifecycle` uses `repeatOnLifecycle` with `Lifecycle.State.STARTED` as the default `minActiveState`. You can override this if needed — `collectAsStateWithLifecycle(initialValue = ..., minActiveState = Lifecycle.State.RESUMED)` — but `STARTED` is the right default for the same reasons I described above.

The difference matters in practice. In an app I worked on, switching from `collectAsState` to `collectAsStateWithLifecycle` for a real-time pricing flow reduced background CPU usage by roughly 40% because we stopped processing WebSocket messages when the screen wasn't visible. That's battery life users notice.

## Common Mistakes

**Using `launchWhenStarted` (deprecated).** Before `repeatOnLifecycle` existed, the recommended pattern was `lifecycleScope.launchWhenStarted`. This suspends the coroutine when the lifecycle drops below `STARTED` instead of cancelling it. The difference is critical — suspending means the coroutine is still alive, holding references to everything in its closure. The upstream flow producer keeps running too, buffering emissions that pile up in memory. `repeatOnLifecycle` cancels the coroutine entirely, so the upstream flow stops producing. Google deprecated `launchWhenStarted` for exactly this reason. If you see it in your codebase, replace it.

**Using `collectAsState` instead of `collectAsStateWithLifecycle`.** This is the Compose equivalent of the same mistake. `collectAsState` is fine for flows that are truly UI-local (a `snapshotFlow` tracking scroll position, for example), but for any flow backed by network, database, or sensor data, use `collectAsStateWithLifecycle`. The lint rule `FlowOperatorInvokedInComposition` won't catch this — you have to know the difference.

**Collecting in `onCreate` without `repeatOnLifecycle`.** I covered this earlier, but it's worth repeating because it's the single most common flow collection bug I've seen in code reviews. `lifecycleScope.launch { flow.collect { } }` runs until the Activity or Fragment is destroyed. It does not stop when the app goes to the background. Wrap every UI flow collection in `repeatOnLifecycle(Lifecycle.State.STARTED)`.

**Forgetting `viewLifecycleOwner` in Fragments.** Using `lifecycleScope` in a Fragment's `onViewCreated` ties the collection to the Fragment's lifecycle, not the view's lifecycle. When the Fragment is on the back stack, its view is destroyed but the Fragment lives on. The coroutine keeps running, collects a new value, and tries to access a binding that's already null. Always use `viewLifecycleOwner.lifecycleScope` and `viewLifecycleOwner.repeatOnLifecycle` in Fragments.

## Quiz

**Question 1.** What's the difference between `lifecycleScope.launch { flow.collect { } }` and wrapping the collection in `repeatOnLifecycle(Lifecycle.State.STARTED)`?

**Wrong**: They're the same — both stop collecting when the Activity is destroyed.

**Correct**: `lifecycleScope.launch` keeps collecting even when the app is in the background, stopping only when the lifecycle reaches `DESTROYED`. `repeatOnLifecycle(STARTED)` cancels the collecting coroutine when the lifecycle drops below `STARTED` (the app is backgrounded) and relaunches it when the lifecycle reaches `STARTED` again. This saves resources because the upstream flow stops producing while the UI isn't visible.

**Question 2.** In Compose, why should you use `collectAsStateWithLifecycle()` instead of `collectAsState()`?

**Wrong**: `collectAsStateWithLifecycle()` is faster because it uses an optimized internal collector.

**Correct**: `collectAsState()` keeps collecting the flow even when the app is in the background because it's tied to composition, not the Android lifecycle. `collectAsStateWithLifecycle()` uses `repeatOnLifecycle` internally with `Lifecycle.State.STARTED` by default, so it stops collection when the app is backgrounded and restarts when it becomes visible again. For flows backed by network, database, or sensor work, this prevents wasted CPU, battery, and memory.

## Coding Challenge

Build a `DashboardFragment` that collects three flows from a `DashboardViewModel`: `ordersFlow` (a `StateFlow<List<Order>>`), `revenueFlow` (a `Flow<Revenue>`), and `alertsFlow` (a `SharedFlow<Alert>`). Use `viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED)` to collect all three flows with proper lifecycle awareness. Each flow should update a different part of the UI. Then convert the Fragment to a Compose screen using `collectAsStateWithLifecycle()` for each flow. Verify that backgrounding the app stops all three collections in both implementations.

Thanks for reading!
