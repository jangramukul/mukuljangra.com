---
title: "Activity & Fragment Lifecycle"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 5
sequence: 5
description: "Lifecycle is the most commonly asked topic in Android interviews. Every company will ask at least 2-3 lifecycle questions."
---

## Activity & Fragment Lifecycle

Lifecycle is the most commonly asked topic in Android interviews. Every company will ask at least 2-3 lifecycle questions.

### Core Questions (Beginner → Intermediate)

#### Q1: Walk me through the Activity lifecycle callbacks and what each one is meant for.

- **onCreate** — Activity enters the Created state. This is where all initialization happens like calling `setContentView()`, setting up the ViewModel, and restoring saved state from the Bundle.
- **onStart** — Activity becomes visible to the user but isn't interactive yet. This is where UI-related setup that should happen every time the Activity becomes visible goes.
- **onResume** — Activity is in the foreground and the user can interact with it. Acquire resources like camera preview, sensor listeners, and location updates here.
- **onPause** — First signal the user is leaving. The Activity may still be partially visible (multi-window or a dialog on top). Release battery-draining resources like sensors and GPS, but keep it lightweight.
- **onStop** — Activity is no longer visible. Persist data, stop animations, and release heavier resources here. Unlike `onPause`, you have enough time for CPU-intensive operations.
- **onDestroy** — Final cleanup before the Activity is gone. Called either because the user finished the Activity or the system destroyed it for a configuration change. You can check `isFinishing()` to distinguish between the two.

In multi-window mode, an Activity can be fully visible while paused. If you release the camera in `onPause`, users in split-screen will see a blank preview.

#### Q2: Why do we call setContentView() only in onCreate?

`onCreate` is invoked only once per Activity instance, so the view hierarchy only needs to be set up once. Setting it in `onCreate` also means views are available for subsequent lifecycle callbacks like `onStart` and `onRestoreInstanceState`. If you inflated in `onResume`, you'd re-inflate the entire view tree every time the user returned to the Activity, which would be expensive and wipe out view state.

#### Q3: What happens when the user rotates the device? Walk through the exact callback order.

Rotation is a configuration change. The system destroys and recreates the Activity. The exact sequence on API 28+ is:

`onPause` → `onStop` → `onSaveInstanceState` → `onDestroy` → `onCreate` → `onStart` → `onRestoreInstanceState` → `onResume`

On API 28+, `onSaveInstanceState` is called after `onStop`. On older APIs, it was called before `onStop`. `onRestoreInstanceState` is called after `onStart`, not inside `onCreate`. You can restore state in `onCreate` using the `savedInstanceState` bundle, but `onRestoreInstanceState` is only called when there's actually saved state to restore — no null check needed.

#### Q4: When does onDestroy get called without onPause and onStop being called first?

When you call `finish()` inside `onCreate`. The system skips directly to `onDestroy` because the Activity never reached the Started or Resumed state. Lifecycle callbacks are tied to state transitions, not a fixed sequence that always runs top-to-bottom.

#### Q5: What is the difference between onSaveInstanceState and onRestoreInstanceState?

`onSaveInstanceState` is called before the Activity is destroyed (after `onStop` on API 28+, before `onStop` on older APIs). You use it to save transient UI state — scroll position, text input, toggle states — into a `Bundle`. The default implementation already saves the View hierarchy state automatically (like `EditText` content).

`onRestoreInstanceState` is called after `onStart` when the Activity is being recreated. It's **only** called when there's actually a saved state `Bundle` — if the Activity is starting fresh, this callback is never invoked.

```kotlin
override fun onSaveInstanceState(outState: Bundle) {
    super.onSaveInstanceState(outState)
    outState.putInt("PLAYER_SCORE", currentScore)
    outState.putString("SEARCH_QUERY", searchQuery)
}

override fun onRestoreInstanceState(savedInstanceState: Bundle) {
    super.onRestoreInstanceState(savedInstanceState)
    currentScore = savedInstanceState.getInt("PLAYER_SCORE")
    searchQuery = savedInstanceState.getString("SEARCH_QUERY", "")
}
```

Avoid saving large objects in the `Bundle`. It's serialized to Binder transactions which have a ~1 MB limit. Save only lightweight identifiers and store the actual data in a `ViewModel` or local database.

#### Q6: List the Fragment lifecycle callbacks in order. How do they differ from Activity?

Fragments have 12 lifecycle methods compared to Activity's 6. The full order is:

`onAttach` → `onCreate` → `onCreateView` → `onViewCreated` → `onActivityCreated` (deprecated) → `onStart` → `onResume` → `onPause` → `onStop` → `onDestroyView` → `onDestroy` → `onDetach`

The six additional callbacks compared to Activity:
- `onAttach` — Fragment is associated with its host Activity.
- `onCreateView` — Inflate or create the Fragment's view hierarchy.
- `onViewCreated` — View is ready, set up observers and adapters here.
- `onActivityCreated` — Deprecated. Was for when the host Activity's `onCreate` finished.
- `onDestroyView` — View is being removed but the Fragment itself may still exist.
- `onDetach` — Fragment is disassociated from the host Activity.

A Fragment can have its view destroyed while the Fragment itself survives. This happens when you navigate away in a FragmentTransaction with `addToBackStack` — `onDestroyView` is called, but `onDestroy` and `onDetach` are not. When the user presses back, `onCreateView` and `onViewCreated` run again with the same Fragment instance.

#### Q7: Why should Fragments only use the default (no-argument) constructor?

The system needs the default constructor for Fragment restoration. When a configuration change happens or the system kills your process, the `FragmentManager` recreates Fragments using reflection with `Class.newInstance()`, which requires a public no-arg constructor. Data passed through a custom constructor is lost on recreation.

The correct approach is `setArguments()` with a `Bundle`:

```kotlin
class UserProfileFragment : Fragment() {
    companion object {
        fun newInstance(userId: String): UserProfileFragment {
            return UserProfileFragment().apply {
                arguments = Bundle().apply {
                    putString("USER_ID", userId)
                }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val userId = requireArguments().getString("USER_ID")
    }
}
```

The `arguments` Bundle is automatically saved and restored by the `FragmentManager`. Custom constructors will compile and run, but the app will crash after a configuration change or process death when the system tries to recreate the Fragment.

#### Q8: What is viewLifecycleOwner in a Fragment and why does it matter?

A Fragment has two separate `Lifecycle` objects — one for the Fragment itself (`this`) and one for its view (`viewLifecycleOwner`). The Fragment's view can be destroyed and recreated while the Fragment object stays alive, like when navigating away and coming back via the back stack.

When observing `LiveData` or collecting `Flow` in a Fragment, use `viewLifecycleOwner` instead of `this`:

```kotlin
override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
    super.onViewCreated(view, savedInstanceState)

    // Correct — observation stops when view is destroyed
    viewModel.uiState.observe(viewLifecycleOwner) { state ->
        updateUI(state)
    }

    // Wrong — observation leaks because Fragment outlives its view
    viewModel.uiState.observe(this) { state ->
        updateUI(state)
    }
}
```

If you observe with `this`, the observer stays active even after `onDestroyView`. When `onCreateView` runs again, you register a second observer — two observers updating the same UI causes duplicate updates, stale references, and potential crashes.

#### Q9: How does ViewModel survive configuration changes?

`ComponentActivity` implements `ViewModelStoreOwner` and holds a `ViewModelStore`, which is essentially a `HashMap<String, ViewModel>`. During a configuration change, the framework retains this `ViewModelStore` through `NonConfigurationInstances`, a special object the system preserves across Activity recreation.

When the new Activity instance is created after rotation, it retrieves the same `ViewModelStore` from the retained `NonConfigurationInstances`, so your `ViewModel` instances are still there with all their data. The `ViewModel` is only cleared via `onCleared()` when the owner is permanently destroyed — `finish()` was called, the user navigated away, or the Fragment was detached for good.

#### Q10: What's the difference between ViewModel and SavedStateHandle? When do you need both?

`ViewModel` survives configuration changes (rotation, language change) but does **not** survive process death. If the system kills your app in the background, the `ViewModel` and all its in-memory data are gone.

`SavedStateHandle` survives both configuration changes and process death. It's backed by the `savedInstanceState` Bundle mechanism, same as `onSaveInstanceState` but accessible from within the ViewModel.

```kotlin
class SearchViewModel(
    private val savedStateHandle: SavedStateHandle,
    private val searchRepository: SearchRepository
) : ViewModel() {

    // Survives both config changes AND process death
    val searchQuery: StateFlow<String> =
        savedStateHandle.getStateFlow("query", "")

    // Survives config changes only — lost on process death
    private val _searchResults = MutableStateFlow<List<SearchResult>>(emptyList())
    val searchResults: StateFlow<List<SearchResult>> = _searchResults.asStateFlow()

    fun onQueryChanged(query: String) {
        savedStateHandle["query"] = query
        viewModelScope.launch {
            _searchResults.value = searchRepository.search(query)
        }
    }
}
```

Use `SavedStateHandle` for lightweight state the user expects to survive (search query, scroll position, selected tab) and regular ViewModel state for data that can be re-fetched (API results, repository data). If losing the data would confuse the user, put it in `SavedStateHandle`.

### Deep Dive Questions (Advanced → Expert)

#### Q11: Explain the Activity transition lifecycle — what happens when Activity A starts Activity B?

The callback sequence overlaps between the two Activities:

1. **Activity A: `onPause()`** — A loses foreground but may still be visible
2. **Activity B: `onCreate()`** → **`onStart()`** → **`onResume()`** — B fully initializes and takes focus
3. **Activity A: `onStop()`** — A is now completely hidden behind B

Long-running operations in `onPause` will delay the next Activity from appearing. If A's `onPause` takes 500ms, the user sees a frozen screen for 500ms before B shows up.

#### Q12: What happens during process death? How is it different from a configuration change?

During a configuration change, the system destroys and immediately recreates the Activity. The process stays alive, `ViewModel` survives, and `onSaveInstanceState`/`onRestoreInstanceState` handle the UI state.

Process death is different — the system kills the entire Linux process. Every Activity, Service, ViewModel, and in-memory object is gone. There's no `onDestroy` callback because the process is killed forcefully. The `Bundle` from `onSaveInstanceState` is the only thing that survives because the system stores it outside the process.

When the user taps the app from the Recents screen, the system recreates the Activity with the saved `Bundle` and a fresh `ViewModel` instance. Any data only stored in the `ViewModel` is lost. This is why `SavedStateHandle` exists — it bridges the gap between ViewModel's in-memory state and the Bundle's process-death-safe persistence.

You can simulate process death in Android Studio via "Terminate Application" in Logcat while the app is backgrounded, or use `adb shell am kill <package>`.

#### Q13: Explain onNewIntent. When is it called and with which launch modes?

`onNewIntent` is called when an Activity receives a new `Intent` without being recreated. This happens with specific launch modes:

- **singleTop** — If the Activity is already at the top of the task stack, the system calls `onNewIntent` instead of creating a new instance. The sequence is `onNewIntent` → `onResume`.
- **singleTask** — If the Activity exists anywhere in the task, it's brought to the top and all Activities above it are destroyed. `onNewIntent` delivers the new Intent.
- **singleInstance** — Similar to `singleTask` but the Activity is always the only member of its task.

Note that `getIntent()` still returns the original Intent after `onNewIntent`. You must call `setIntent(newIntent)` explicitly:

```kotlin
override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)  // Update so getIntent() returns the new one
    handleDeepLink(intent)
}
```

Without calling `setIntent()`, deep links work on first launch but silently fail when the Activity already exists.

#### Q14: How does multi-window mode affect the Activity lifecycle?

In multi-window (split-screen) mode, only one Activity has focus at a time. The other Activity is in the Paused state but still fully visible. This means `onPause` does not imply the Activity is no longer visible.

If you release the camera, pause video, or stop animations in `onPause`, users in split-screen see a frozen or blank screen. Move those operations to `onStop` instead, which means the Activity is genuinely no longer visible. If you need the camera active during multi-window, initialize it in `onStart` and release in `onStop`.

Picture-in-Picture (PiP) follows the same principle — the Activity enters PiP and receives `onPause` but is still visible as a floating window. Interactive elements should be disabled, but playback should continue.

#### Q15: What is setRetainInstance(true) on a Fragment, and why is it deprecated?

`setRetainInstance(true)` told the `FragmentManager` to keep the Fragment instance alive across configuration changes. The Fragment would skip `onDestroy` and `onDetach` during rotation and go through `onDestroyView` → `onCreateView` instead of the full destruction cycle.

It's deprecated because `ViewModel` does the same job better. Retained Fragments couldn't be added to the back stack, complicated the Fragment lifecycle, and mixed data retention with UI logic. `ViewModel` cleanly separates concerns — it holds data, the Fragment manages UI.

#### Q16: Explain the difference between FragmentPagerAdapter and FragmentStatePagerAdapter.

Both are deprecated in favor of `ViewPager2` with `FragmentStateAdapter`.

**FragmentPagerAdapter** keeps every Fragment instance in memory. When you swipe away, the Fragment is detached (`onDestroyView` is called) but not destroyed. Good for a small, fixed number of pages.

**FragmentStatePagerAdapter** destroys Fragments when they're off-screen and saves their state via `onSaveInstanceState`. Only the currently visible Fragment and its immediate neighbors (based on `offscreenPageLimit`) are alive. This is what you want for large datasets.

The modern `ViewPager2`'s `FragmentStateAdapter` behaves like `FragmentStatePagerAdapter` — it destroys and recreates Fragments using the `RecyclerView` recycling mechanism.

#### Q17: How does ViewModel scoping work? What's a ViewModelStoreOwner?

`ViewModelStoreOwner` is an interface with a single method: `getViewModelStore()`. Three classes implement it:

- **ComponentActivity** — ViewModel lives until `finish()` is called
- **Fragment** — ViewModel lives until the Fragment is permanently detached
- **NavBackStackEntry** — ViewModel lives until the destination is popped from the back stack

When you call `ViewModelProvider(owner).get(MyViewModel::class.java)`, it looks up or creates the ViewModel in that owner's `ViewModelStore`. If both Fragments use the Activity as the owner, they get the same ViewModel instance:

```kotlin
// In FragmentA — scoped to the Activity
val sharedViewModel: OrderViewModel by activityViewModels()

// In FragmentB — same ViewModel instance
val sharedViewModel: OrderViewModel by activityViewModels()

// In FragmentC — scoped to the Fragment itself (different instance)
val localViewModel: OrderViewModel by viewModels()
```

With Navigation Component, you can also scope to a navigation graph. This is cleaner than Activity scoping because the ViewModel gets cleared when the user leaves that navigation flow, not when the entire Activity finishes.

#### Q18: What are lifecycle-aware components? How do LifecycleObserver and DefaultLifecycleObserver work?

Lifecycle-aware components observe the lifecycle without holding direct references to Activities or Fragments. The Lifecycle API has two pieces — `LifecycleOwner` (Activities, Fragments, and viewLifecycleOwner implement this) and `LifecycleObserver` (your components implement this to react to lifecycle events).

`DefaultLifecycleObserver` is the recommended approach (the annotation-based `@OnLifecycleEvent` is deprecated):

```kotlin
class LocationTracker(
    private val fusedLocationClient: FusedLocationProviderClient
) : DefaultLifecycleObserver {

    override fun onStart(owner: LifecycleOwner) {
        fusedLocationClient.requestLocationUpdates(locationRequest, callback, Looper.getMainLooper())
    }

    override fun onStop(owner: LifecycleOwner) {
        fusedLocationClient.removeLocationUpdates(callback)
    }
}

// In Activity or Fragment
lifecycle.addObserver(LocationTracker(fusedLocationClient))
```

The `LocationTracker` manages its own lifecycle without the Activity knowing anything about location logic. The observer handles registering and unregistering callbacks automatically. This is the pattern behind Jetpack libraries like `LiveData`, `WorkManager`, and `ProcessLifecycleOwner`.

#### Q19: What is ProcessLifecycleOwner and when would you use it?

`ProcessLifecycleOwner` provides a `Lifecycle` for the entire application process, not individual Activities. It moves to `ON_START` when the first Activity becomes visible and to `ON_STOP` when the last Activity becomes invisible. It tells you whether your app is in the foreground or background.

`ON_DESTROY` is never dispatched because process death can happen without warning. `ON_CREATE` is dispatched only once when the process starts.

Common use cases include detecting foreground/background transitions for analytics, pausing/resuming a WebSocket connection, or refreshing auth tokens when the user returns to the app.

#### Q20: How would you test Activity lifecycle behavior?

`ActivityScenario` from the `androidx.test` library gives you programmatic control over an Activity's lifecycle state:

```kotlin
@Test
fun activityRecreation_preservesViewModelData() {
    val scenario = ActivityScenario.launch(SearchActivity::class.java)

    // Simulate user entering a search query
    scenario.onActivity { activity ->
        activity.viewModel.onQueryChanged("kotlin coroutines")
    }

    // Simulate configuration change (rotation)
    scenario.recreate()

    // Verify ViewModel data survived
    scenario.onActivity { activity ->
        assertEquals("kotlin coroutines",
            activity.viewModel.searchQuery.value)
    }
}
```

You can also move the Activity to specific states with `moveToState(Lifecycle.State.CREATED)` to test behavior at each lifecycle stage. For Fragment testing, `FragmentScenario` provides the same capabilities.

#### Q21: What is the Fragment Result API and how does it replace Fragment-to-Fragment communication?

The Fragment Result API (`setFragmentResult` / `setFragmentResultListener`) replaces the old pattern of communicating between Fragments via shared ViewModels or callback interfaces. It uses the `FragmentManager` as a mediator:

```kotlin
// FragmentA — listening for a result
setFragmentResultListener("filter_request") { requestKey, bundle ->
    val selectedFilter = bundle.getString("selected_filter")
    applyFilter(selectedFilter)
}

// FragmentB — sending a result
setFragmentResult("filter_request", bundleOf("selected_filter" to "price_low"))
```

The result is delivered when the listener's Fragment is in `STARTED` state or later. If FragmentB sets a result while FragmentA is stopped, the result is delivered when FragmentA reaches `STARTED` again. Only the latest result is kept for each key — setting a new result with the same key replaces the previous one. This API is lifecycle-aware and avoids direct Fragment references.

#### Q22: Explain the relationship between Fragment lifecycle and Activity lifecycle. Can a Fragment's state exceed its host Activity's state?

A Fragment can never have a lifecycle state that exceeds its host `FragmentManager`'s state, which is constrained by the Activity. If the Activity is in `STARTED` state, no Fragment can be in `RESUMED` state. The parent must reach a state before any child Fragment can reach that state.

The reverse also applies — child Fragments must be stopped before their parent Activity stops. You can further restrict a Fragment's maximum lifecycle state using `setMaxLifecycle()` on the FragmentTransaction. This is how `ViewPager2`'s `FragmentStateAdapter` works — it sets off-screen Fragments to `STARTED` state maximum so they never reach `RESUMED`.

Use `FragmentContainerView` instead of the `<fragment>` XML tag. The `<fragment>` tag can allow Fragments to exceed their FragmentManager's state during initialization, while `FragmentContainerView` enforces proper lifecycle ordering.

### Common Follow-ups

- What data should go in `onSaveInstanceState` Bundle vs. ViewModel vs. a local database?
- How do you handle a deep link that arrives via `onNewIntent` when the Activity's ViewModel has stale data?
- What happens if you call `finish()` in `onResume`? Does `onPause` and `onStop` still get called?
- How does `ViewModel` scoping change when you use Jetpack Navigation's nested graphs?
- Can you give an example of a memory leak caused by observing `LiveData` with `this` instead of `viewLifecycleOwner`?
- How does `rememberSaveable` in Jetpack Compose relate to `onSaveInstanceState`?
- What's the difference between `FragmentTransaction.add()` and `FragmentTransaction.replace()` in terms of lifecycle?
- How do you pass data between a parent Fragment and a child Fragment using the Result API?
