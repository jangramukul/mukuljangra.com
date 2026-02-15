---
title: Understanding Android Activity Lifecycle
layout: post
sequence: 1
categories: post
tags:
  - Android
  - Architecture
---

One of the first production bugs I ever shipped was a lifecycle bug. The app was a simple news reader — nothing fancy. But users kept reporting that their scroll position was lost whenever they rotated the phone. I was resetting the entire adapter in `onCreate` without checking if it was a configuration change. The fix took two minutes. Understanding *why* it happened took me much longer, and it changed how I thought about Activities forever.

The Activity lifecycle seems straightforward on the surface — `onCreate`, `onStart`, `onResume`, and their mirrors on the way down. Every Android tutorial covers this within the first chapter. But most tutorials stop at the diagram. They don't explain what the framework is actually doing at each callback, why the ordering matters, or what happens when the system kills your process behind your back. That deeper understanding is what separates developers who build stable apps from developers who keep shipping lifecycle bugs into production.

## What Each Callback Actually Does

Most developers memorize the lifecycle callbacks as a sequence. But each callback has a specific contract with the framework, and understanding that contract matters more than memorizing the order.

**onCreate** is where you build the Activity's view hierarchy. The framework passes a `Bundle` — either null for a fresh start, or populated if the Activity is being recreated. Here's the thing most people miss: `onCreate` is guaranteed to be called, but it's not guaranteed to be called only once for a given logical session. Configuration changes, process death, and even system-initiated destruction will trigger `onCreate` again with a saved state bundle. If you're initializing resources here that shouldn't be duplicated — like registering a broadcast receiver or starting a background thread — you need to guard against re-initialization. Real-world use case: setting up your ViewModel, inflating your layout, reading navigation arguments from the Intent, and restoring the UI from `savedInstanceState`.

**onStart** makes the Activity visible but not yet interactive. This is where the Activity enters the "started" state in the lifecycle, and it's the earliest point where lifecycle-aware components like `LiveData` begin delivering updates. The distinction between visible and interactive matters. A dialog Activity sitting on top of yours means your Activity is visible (started) but not in the foreground (not resumed). If you're doing work that should only happen when the user is actively interacting, `onResume` is your callback, not `onStart`. Real-world use case: registering a `BroadcastReceiver` for connectivity changes that should update the UI, or starting a CameraX preview that should be visible even behind a transparent dialog.

**onResume** is where the Activity is fully in the foreground and interactive. This is the callback that pairs with `onPause`, and it's the narrowest window in the lifecycle. If you're connecting to a camera, starting animations, or acquiring exclusive resources, this is where you do it — and `onPause` is where you release them. Real-world use case: resuming a video player, starting sensor listeners for a fitness app's step counter, or refreshing a user's online status.

**onPause** is the first signal that the user is leaving. It's called when another Activity comes to the foreground, when a dialog appears, or when the system starts the process of moving your Activity to the background. The critical thing about `onPause` is that it's guaranteed to be called before your Activity becomes invisible. `onStop` is not — in pre-Honeycomb days, `onStop` could be skipped entirely if the system killed the process. Since API 11, `onStop` is reliably called, but `onPause` remains the safe place for releasing resources that shouldn't outlive the foreground state. Real-world use case: pausing a game loop, releasing camera access, stopping GPS updates that only matter while the user is actively looking at the screen.

**onStop** means the Activity is no longer visible. This is a good place to release heavy resources that don't need to persist while the Activity is invisible — like unregistering listeners, stopping animations, or pausing video playback. One important detail: after `onStop`, the system may kill the process at any time. In practice, this doesn't happen often on modern devices with plenty of RAM, but on low-memory devices it's common. Your app needs to survive this. Real-world use case: saving draft data to a local database, flushing analytics events, unregistering `ContentObserver` instances.

**onDestroy** is the final callback. It's called when the Activity is finishing (the user pressed back, or you called `finish()`) or when the system is destroying it due to a configuration change. You can check `isFinishing()` to distinguish between these two cases. But I'd argue that if you're doing significant work in `onDestroy`, your architecture might be wrong. Cleanup should mostly happen in `onStop` and `onPause`. Real-world use case: releasing a `MediaPlayer` instance, closing a `HandlerThread`, or shutting down a custom `ExecutorService` that the Activity owns.

## Lifecycle-Aware Components — Letting the Lifecycle Come to You

Before `LifecycleObserver`, managing lifecycle-dependent operations meant overriding every callback in your Activity and coordinating start/stop pairs across multiple components. If you had a location tracker, an analytics logger, and a socket connection, your Activity ended up with six overrides just to call `start()` and `stop()` on three objects. One missed pairing and you had a leak.

The `Lifecycle` API introduced in Architecture Components flipped this around. Instead of the Activity pushing lifecycle events to its components, the components observe the lifecycle and react on their own. This is the observer pattern applied to Android lifecycles, and it eliminates the manual wiring.

```kotlin
class LocationTracker(
    private val locationClient: FusedLocationProviderClient
) : DefaultLifecycleObserver {

    private var locationCallback: LocationCallback? = null

    override fun onStart(owner: LifecycleOwner) {
        val callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                // Process location update
            }
        }
        locationCallback = callback
        locationClient.requestLocationUpdates(
            LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10_000L).build(),
            callback,
            Looper.getMainLooper()
        )
    }

    override fun onStop(owner: LifecycleOwner) {
        locationCallback?.let { locationClient.removeLocationUpdates(it) }
        locationCallback = null
    }
}

// In your Activity — one line, no overrides needed
class MapActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycle.addObserver(LocationTracker(locationClient))
    }
}
```

The power here is that `LocationTracker` manages its own lifecycle. The Activity doesn't need to know when to start or stop tracking. It just registers the observer and the `Lifecycle` object handles the rest. You can add five more lifecycle-aware components and your Activity stays clean. Under the hood, `LifecycleRegistry` dispatches events to observers in the correct order — `ON_START` observers fire after the Activity's `onStart`, and `ON_STOP` observers fire before the Activity's `onStop`. This ordering guarantee is critical and something you'd get wrong if you tried to build this manually.

`DefaultLifecycleObserver` is the preferred API since Lifecycle 2.4. The older `LifecycleEventObserver` gives you a single callback with the event as a parameter, which is useful when you need to handle multiple events dynamically. But for most components, `DefaultLifecycleObserver` with its named methods is clearer.

## Configuration Changes — The Most Common Lifecycle Trap

The lifecycle bug I described in the opening is a configuration change bug, and it's the most common category of lifecycle issues in Android apps. When the user rotates the device, changes the language, resizes the window, or connects a keyboard, the system destroys and recreates the Activity. The full sequence is `onPause` → `onStop` → `onSaveInstanceState` → `onDestroy` → `onCreate` → `onStart` → `onResume`.

The reason the system does this instead of just notifying the Activity is that resources might change. A rotation might switch from a portrait layout to a landscape layout. A language change might load different string resources. The simplest way to pick up all the new resources is to restart from scratch with a fresh `onCreate`. It's aggressive, but it's reliable.

The problem is that your Activity's in-memory state — the scroll position, the text in an EditText, the data loaded from the network — is wiped out. The framework provides two mechanisms to survive this:

```kotlin
class ArticleActivity : AppCompatActivity() {

    private lateinit var viewModel: ArticleViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_article)

        // ViewModel survives configuration changes — it's scoped
        // to the ViewModelStore, which outlives the Activity
        viewModel = ViewModelProvider(this)[ArticleViewModel::class.java]

        if (savedInstanceState != null) {
            val scrollPosition = savedInstanceState.getInt("scroll_pos", 0)
            recyclerView.scrollToPosition(scrollPosition)
        }

        viewModel.articles.observe(this) { articles ->
            adapter.submitList(articles)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        val layoutManager = recyclerView.layoutManager as LinearLayoutManager
        outState.putInt("scroll_pos", layoutManager.findFirstVisibleItemPosition())
    }
}
```

`onSaveInstanceState` is called before `onDestroy` during configuration changes and before process death. It gives you a `Bundle` to write small pieces of UI state — scroll positions, selected tabs, draft text. The key word is "small." The `Bundle` is serialized through Binder transactions, and there's a size limit (roughly 500KB for the entire transaction). I've seen crashes from developers stuffing entire API responses into the saved state bundle. Don't do that — use `ViewModel` for transient data and `SavedStateHandle` for the small pieces that need to survive process death.

## Fragment Lifecycle — The Layer Inside the Layer

Fragments have their own lifecycle that nests inside the Activity lifecycle, and it adds callbacks that don't exist on Activities. The most important ones are `onCreateView`, `onViewCreated`, `onDestroyView`, and `onViewStateRestored`. The critical thing to understand is that a Fragment can outlive its view. When a Fragment is on the back stack, the system destroys its view hierarchy (calling `onDestroyView`) but keeps the Fragment instance alive. When the user navigates back, `onCreateView` runs again with the same Fragment instance.

This creates a category of bugs that Activities don't have. If you hold a reference to a view binding or a RecyclerView adapter in a Fragment property, and the view is destroyed but the Fragment survives, you're leaking the old view hierarchy. The standard pattern is to null out view references in `onDestroyView`.

```kotlin
class OrderListFragment : Fragment(R.layout.fragment_order_list) {

    private var _binding: FragmentOrderListBinding? = null
    private val binding get() = _binding!!

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        _binding = FragmentOrderListBinding.bind(view)
        // Set up views using binding
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null  // Prevent view leak while Fragment is on back stack
    }
}
```

The Fragment lifecycle also has `viewLifecycleOwner`, which is scoped to the view rather than the Fragment. When you observe `LiveData` or collect `Flow` from a Fragment, always use `viewLifecycleOwner` — not `this` (the Fragment). Using the Fragment's lifecycle means observations continue even after the view is destroyed, which can cause crashes when the observer tries to update a view that no longer exists.

## Multi-Window and Picture-in-Picture — Lifecycle Edge Cases

Android 7.0 introduced multi-window mode, which changed a fundamental assumption about the lifecycle. Before multi-window, `onPause` meant the Activity was no longer visible. In multi-window, an Activity can be paused but fully visible — it just doesn't have focus. The other app in the split screen has focus, so your Activity is in the STARTED state but not RESUMED.

This matters for anything tied to `onResume`/`onPause`. If you stop video playback in `onPause`, the video freezes as soon as the user taps the other app in split screen — even though your app is still fully visible. The fix is to move playback pause to `onStop` instead. Google updated their guidance after multi-window: use `onStart`/`onStop` for visibility-related work, and `onResume`/`onPause` only for things that require active focus (like camera or exclusive hardware access).

Picture-in-Picture (PiP) mode takes this further. When an Activity enters PiP, it gets `onPause` but the user is still watching the content. Any UI elements other than the playing content should be hidden in PiP, but playback must continue. This is another case where pausing video in `onPause` breaks the user experience.

## Process Death — The Lifecycle Event Nobody Tests For

Configuration changes get the most attention, but process death is the lifecycle event that causes the sneakiest bugs. Here's what happens: the user opens your app, navigates to a detail screen, then switches to another app. An hour passes. The system is low on memory and kills your process. The user comes back to your app. Android recreates the Activity from the task's back stack, calling `onCreate` with the `Bundle` you saved in `onSaveInstanceState`.

The catch is that everything in memory is gone. Your `ViewModel`, your singletons, your dependency injection graph, your static variables — all wiped. The only thing that survives is the `Bundle`. If you didn't save critical navigation state into the bundle, the user sees a broken screen. If your ViewModel initialization depends on data passed from the previous screen via in-memory references, that data is gone.

```kotlin
class OrderDetailViewModel(
    private val savedStateHandle: SavedStateHandle,
    private val orderRepository: OrderRepository
) : ViewModel() {

    // SavedStateHandle survives process death — it's backed
    // by the Activity's saved instance state Bundle
    private val orderId: String = savedStateHandle.get<String>("order_id")
        ?: throw IllegalStateException("order_id is required")

    val orderState: StateFlow<UiState<Order>> = flow {
        emit(UiState.Loading)
        try {
            val order = orderRepository.getOrder(orderId)
            emit(UiState.Success(order))
        } catch (e: Exception) {
            emit(UiState.Error(e.message ?: "Failed to load order"))
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), UiState.Loading)
}
```

The `SavedStateHandle` is the bridge between ViewModel convenience and process death safety. It's backed by the Activity's saved instance state, so it persists across both configuration changes and process death. But it still has the same size limitations as the `Bundle` — store IDs and navigation arguments, not entire data models.

## Testing for Process Death

I've made a habit of testing for process death during development, and I think every Android developer should too. There are several approaches, each catching different categories of bugs.

**"Don't keep activities" in Developer Options** — This aggressively destroys Activities when you navigate away. It's not exactly process death (your process stays alive, so singletons and static state persist), but it catches issues with `onSaveInstanceState` not saving enough data. I leave this on during development as a first line of defense.

**`adb shell am kill`** — The most realistic test. Put the app in the background, then run `adb shell am kill <your.package.name>` from the terminal. This kills the process exactly like the OS would. When you return to the app, it recreates the full Activity stack from saved state. If your app doesn't survive this gracefully, you have work to do. I run this test on every screen before shipping.

**Automated process death testing** — For CI, you can use libraries like `Process Phoenix` or write instrumentation tests that simulate process death. The pattern is: launch the Activity with specific state, save it, kill the process, recreate, and verify the state is restored correctly.

The most common failures I see after process death: navigation arguments that were passed in-memory instead of through the Intent, singletons holding state that should have been in `SavedStateHandle`, and ViewModels that assume `init` data came from a previous screen's callback.

## The Reframe — Activities Are State Machines, Not Screens

Here's what took me years to internalize: **an Activity is not a screen. It's a state machine managed by the framework.** The system can create, destroy, and recreate your Activity at any time, for reasons you don't control — rotation, memory pressure, locale changes, multi-window resizing. Your job is not to prevent this from happening. Your job is to make sure your app handles every transition gracefully.

This mental model shift changes how you architect your app. Instead of treating the Activity as the owner of your data and logic, you treat it as a thin rendering layer. The data lives in ViewModels, repositories, and databases. The navigation state lives in saved instance state. The Activity just connects the pieces and renders the current state. When the system destroys and recreates it, nothing of value is lost because nothing of value lived there in the first place.

This is also why the single-Activity architecture gained traction. With one Activity and multiple Fragments (or Compose destinations), you reduce the surface area for lifecycle bugs. The Activity lifecycle still matters — your single Activity still goes through all the same callbacks — but you're dealing with it in one place instead of twenty.

```kotlin
class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            val navController = rememberNavController()
            AppNavGraph(navController = navController)
        }
    }
}
```

The thinnest possible Activity. No business logic, no data loading, no state management. Just the entry point. Everything else lives in Composables, ViewModels, and the navigation graph. When this Activity gets recreated, the only thing it needs to do is set up the navigation — and the NavController handles restoring the back stack from saved state automatically.

## Common Lifecycle Mistakes I've Made (And Seen)

**Leaking Activities through long-lived references.** If you pass an Activity reference to a background thread, a network callback, or a singleton, you're holding a reference to an object the system wants to garbage collect. After a configuration change, the old Activity should be collected, but your reference prevents it. The new Activity allocates its own memory, so now you have two Activities in memory — one visible, one leaked. In a ViewModel, always use `applicationContext` when you need a Context, never the Activity itself.

**Doing heavy work in onResume.** I once put a network call in `onResume` because I wanted fresh data every time the user returned to the screen. The problem was that `onResume` is called far more often than I expected — after dismissing a dialog, after returning from a permission request, after the app comes back from the recent apps screen. The screen was making redundant API calls on every minor lifecycle transition. The fix was moving the load into the ViewModel's `init` block and letting `LiveData` deliver the cached result.

**Ignoring onStop for resource cleanup.** Camera connections, sensor listeners, and location updates should be released in `onPause` or `onStop`, not in `onDestroy`. I've debugged apps where the camera stayed acquired while the app was in the background, draining the battery and blocking other apps from using it. `onStop` is the right place for anything that shouldn't run while the Activity is invisible.

**Not using viewLifecycleOwner in Fragments.** I've seen crashes from Fragments observing LiveData with `this` instead of `viewLifecycleOwner`. The Fragment survives on the back stack, the observer fires, it tries to access a binding that was nulled in `onDestroyView`, and the app crashes. Always use `viewLifecycleOwner` for any observation that touches views.

These aren't exotic edge cases. They're the normal behavior of the Activity lifecycle, and they'll burn you if you treat Activities as simple containers instead of the framework-managed state machines they actually are. Understand the contract each callback represents, design your architecture to survive recreation, and test for the scenarios the framework puts you through. The lifecycle isn't your enemy — it's the framework's way of managing limited resources. Your job is to work with it, not against it.

Thank You!
