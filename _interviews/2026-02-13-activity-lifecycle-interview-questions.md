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

#### Walk me through the Activity lifecycle callbacks and what each one is meant for.

- **onCreate** — Called once when the Activity is created. Initialize everything here — `setContentView()`, ViewModel setup, restoring saved state from the Bundle.
- **onStart** — Activity becomes visible but not interactive yet. UI-related setup that needs to happen every time the Activity appears goes here.
- **onResume** — Activity is in the foreground and interactive. Acquire resources like camera, sensors, and location updates here.
- **onPause** — User is leaving. The Activity may still be partially visible (multi-window, dialog on top). Release battery-draining resources but keep it lightweight.
- **onStop** — Activity is no longer visible. Persist data, stop animations, release heavier resources. You have time for CPU-intensive work here unlike `onPause`.
- **onDestroy** — Final cleanup. Called either because the user finished the Activity or the system destroyed it for a configuration change. Check `isFinishing()` to tell them apart.

#### What happens when the user rotates the device?

Rotation is a configuration change. The system destroys and recreates the Activity. The callback order on API 28+ is:

`onPause` → `onStop` → `onSaveInstanceState` → `onDestroy` → `onCreate` → `onStart` → `onRestoreInstanceState` → `onResume`

On API 28+, `onSaveInstanceState` is called after `onStop`. On older APIs, it was called before `onStop`. `onRestoreInstanceState` is only called when there's actually saved state to restore, so no null check needed.

#### What is the difference between onSaveInstanceState and onRestoreInstanceState?

`onSaveInstanceState` saves transient UI state — scroll position, text input, toggle states — into a `Bundle` before the Activity is destroyed. The default implementation already saves View hierarchy state automatically (like `EditText` content).

`onRestoreInstanceState` is called after `onStart` when the Activity is being recreated. It's only called when there's a saved state Bundle. If the Activity is starting fresh, this callback never fires.

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

Don't save large objects in the Bundle. It's serialized to Binder transactions which have a ~1 MB limit. Save lightweight identifiers and keep actual data in a ViewModel or local database.

#### How does ViewModel survive configuration changes?

`ComponentActivity` holds a `ViewModelStore`, which is a `HashMap<String, ViewModel>`. During a configuration change, the framework retains this store through `NonConfigurationInstances` — a special object the system preserves across Activity recreation.

When the new Activity instance is created after rotation, it retrieves the same `ViewModelStore`, so all ViewModel instances are still there with their data. The ViewModel is only cleared via `onCleared()` when the owner is permanently destroyed — `finish()` was called or the user navigated away.

#### What happens when Activity A starts Activity B? Walk through the callback order.

The callbacks overlap between the two Activities:

1. **Activity A: `onPause()`** — A loses foreground but may still be visible
2. **Activity B: `onCreate()`** → **`onStart()`** → **`onResume()`** — B fully initializes and takes focus
3. **Activity A: `onStop()`** — A is completely hidden behind B

Heavy work in `onPause` delays the next Activity from appearing. If A's `onPause` takes 500ms, the user sees a frozen screen for that long before B shows up.

#### What happens during process death? How is it different from a configuration change?

During a configuration change, the system destroys and immediately recreates the Activity. The process stays alive and ViewModel survives.

Process death is different. The system kills the entire Linux process. Every Activity, Service, ViewModel, and in-memory object is gone. There's no `onDestroy` callback — the process is killed forcefully. The Bundle from `onSaveInstanceState` is the only thing that survives because the system stores it outside the process.

When the user returns from Recents, the system recreates the Activity with the saved Bundle and a fresh ViewModel. Any data only stored in the ViewModel is lost. You can simulate process death with "Terminate Application" in Logcat or `adb shell am kill <package>`.

#### What's the difference between ViewModel and SavedStateHandle?

`ViewModel` survives configuration changes but not process death. If the system kills your app in the background, the ViewModel and all its data are gone.

`SavedStateHandle` survives both configuration changes and process death. It's backed by the `savedInstanceState` Bundle mechanism, accessible from within the ViewModel.

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

Use `SavedStateHandle` for state the user expects to survive — search query, scroll position, selected tab. Use regular ViewModel state for data that can be re-fetched like API results.

#### List the Fragment lifecycle callbacks. How do they differ from Activity?

Fragments have additional callbacks compared to Activity. The full order is:

`onAttach` → `onCreate` → `onCreateView` → `onViewCreated` → `onStart` → `onResume` → `onPause` → `onStop` → `onDestroyView` → `onDestroy` → `onDetach`

The extra callbacks compared to Activity:
- **onAttach** — Fragment is associated with its host Activity.
- **onCreateView** — Inflate the Fragment's view hierarchy.
- **onViewCreated** — View is ready. Set up observers and adapters here.
- **onDestroyView** — View is removed but the Fragment itself may still exist.
- **onDetach** — Fragment is disassociated from the host Activity.

A Fragment can have its view destroyed while the Fragment itself survives. This happens with `addToBackStack` — `onDestroyView` is called, but `onDestroy` and `onDetach` are not. When the user presses back, `onCreateView` and `onViewCreated` run again with the same Fragment instance.

#### What is viewLifecycleOwner in a Fragment and why does it matter?

A Fragment has two Lifecycle objects — one for the Fragment itself (`this`) and one for its view (`viewLifecycleOwner`). The view can be destroyed and recreated while the Fragment object stays alive, like when navigating away and coming back via the back stack.

When observing LiveData or collecting Flow in a Fragment, use `viewLifecycleOwner`:

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

If you observe with `this`, the observer stays active after `onDestroyView`. When `onCreateView` runs again, you register a second observer — causing duplicate updates, stale references, and potential crashes.

#### Why should Fragments only use the default no-argument constructor?

The system needs the default constructor for Fragment restoration. During configuration changes or process death, the `FragmentManager` recreates Fragments using reflection with `Class.newInstance()`, which requires a public no-arg constructor. Data passed through a custom constructor is lost.

Use `setArguments()` with a Bundle instead:

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

The `arguments` Bundle is automatically saved and restored by the FragmentManager. Custom constructors will compile but the app crashes after recreation when the system can't find the no-arg constructor.

#### Why do I call setContentView() only in onCreate?

`onCreate` is called once per Activity instance, so the view hierarchy only needs to be set up once. Setting it here also means views are available for subsequent callbacks like `onStart` and `onRestoreInstanceState`. If you inflated in `onResume`, you'd re-inflate the entire view tree every time the user returned, which is expensive and wipes out view state.

#### Explain onNewIntent. When is it called?

`onNewIntent` is called when an Activity receives a new Intent without being recreated. This happens with specific launch modes:

- **singleTop** — Activity is at the top of the stack, so the system calls `onNewIntent` instead of creating a new instance.
- **singleTask** — Activity exists anywhere in the task. It's brought to the top and all Activities above it are destroyed.
- **singleInstance** — Same as singleTask but the Activity is always the only member of its task.

`getIntent()` still returns the original Intent after `onNewIntent`. You must call `setIntent(newIntent)` explicitly:

```kotlin
override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleDeepLink(intent)
}
```

Without `setIntent()`, deep links work on first launch but silently fail when the Activity already exists.

#### When does onDestroy get called without onPause and onStop?

When you call `finish()` inside `onCreate`. The system skips directly to `onDestroy` because the Activity never reached the Started or Resumed state. Lifecycle callbacks are tied to state transitions, not a fixed sequence.

#### How does multi-window mode affect the lifecycle?

In split-screen, only one Activity has focus. The other is in the Paused state but still fully visible. So `onPause` does not mean the Activity is no longer visible.

If you release the camera or stop animations in `onPause`, split-screen users see a frozen or blank screen. Move those operations to `onStop`, which means the Activity is genuinely not visible. Initialize camera in `onStart` and release in `onStop`.

Picture-in-Picture follows the same rule — the Activity receives `onPause` but stays visible as a floating window. Playback should continue.

#### How does ViewModel scoping work?

`ViewModelStoreOwner` is an interface with one method: `getViewModelStore()`. Three classes implement it:

- **ComponentActivity** — ViewModel lives until `finish()` is called.
- **Fragment** — ViewModel lives until the Fragment is permanently detached.
- **NavBackStackEntry** — ViewModel lives until the destination is popped from the back stack.

When both Fragments use the Activity as the owner, they share the same ViewModel:

```kotlin
// In FragmentA — scoped to the Activity
val sharedViewModel: OrderViewModel by activityViewModels()

// In FragmentB — same instance
val sharedViewModel: OrderViewModel by activityViewModels()

// In FragmentC — scoped to Fragment itself (different instance)
val localViewModel: OrderViewModel by viewModels()
```

With Navigation Component, you can scope to a navigation graph. This is cleaner than Activity scoping because the ViewModel clears when the user leaves that flow, not when the entire Activity finishes.

#### What are lifecycle-aware components?

Lifecycle-aware components observe the lifecycle without holding direct references to Activities or Fragments. The API has two pieces — `LifecycleOwner` (implemented by Activities and Fragments) and `LifecycleObserver` (your components implement this).

`DefaultLifecycleObserver` is the recommended approach:

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

The LocationTracker manages its own lifecycle without the Activity knowing about location logic. This is the pattern behind LiveData, WorkManager, and ProcessLifecycleOwner.

#### Can a Fragment's lifecycle state exceed its host Activity's state?

No. A Fragment can never have a lifecycle state higher than its host FragmentManager's state, which is constrained by the Activity. If the Activity is in `STARTED` state, no Fragment can be in `RESUMED` state.

You can further restrict a Fragment's maximum state using `setMaxLifecycle()`. This is how ViewPager2's FragmentStateAdapter works — it sets off-screen Fragments to `STARTED` so they never reach `RESUMED`.

Use `FragmentContainerView` instead of the `<fragment>` XML tag. The `<fragment>` tag can allow Fragments to exceed their FragmentManager's state during initialization.

#### What is the Fragment Result API?

The Fragment Result API replaces communicating between Fragments via shared ViewModels or callback interfaces. It uses the FragmentManager as a mediator:

```kotlin
// FragmentA — listening for a result
setFragmentResultListener("filter_request") { requestKey, bundle ->
    val selectedFilter = bundle.getString("selected_filter")
    applyFilter(selectedFilter)
}

// FragmentB — sending a result
setFragmentResult("filter_request", bundleOf("selected_filter" to "price_low"))
```

The result is delivered when the listener's Fragment is in `STARTED` state or later. Only the latest result is kept per key — setting a new result replaces the previous one. This API is lifecycle-aware and avoids direct Fragment references.

#### What is setRetainInstance(true) and why is it deprecated?

`setRetainInstance(true)` told the FragmentManager to keep the Fragment instance alive across configuration changes. The Fragment would skip `onDestroy` and `onDetach` during rotation and go through `onDestroyView` → `onCreateView` instead.

It's deprecated because ViewModel does the same job better. Retained Fragments couldn't be added to the back stack, complicated the lifecycle, and mixed data retention with UI logic.

#### What is ProcessLifecycleOwner?

`ProcessLifecycleOwner` provides a Lifecycle for the entire application process, not individual Activities. It moves to `ON_START` when the first Activity becomes visible and `ON_STOP` when the last Activity becomes invisible. It tells you if your app is in the foreground or background.

`ON_DESTROY` is never dispatched because process death happens without warning. `ON_CREATE` is dispatched only once when the process starts. Common use cases are foreground/background detection for analytics, pausing WebSocket connections, or refreshing auth tokens when the user returns.

#### What's the difference between FragmentTransaction add() and replace()?

`add()` adds the Fragment on top of the existing one. The existing Fragment stays in its current lifecycle state — it doesn't get `onPause` or `onStop` unless you explicitly hide it. Both Fragments exist in the container.

`replace()` removes the existing Fragment and adds the new one. The old Fragment goes through `onDestroyView` (and `onDestroy` if not on the back stack). If you called `addToBackStack()`, pressing back will recreate the old Fragment's view.

Use `replace()` for most navigation. Use `add()` when you need to overlay Fragments like bottom sheets or dialogs.

#### How do you test Activity lifecycle behavior?

`ActivityScenario` from `androidx.test` gives you programmatic control over lifecycle state:

```kotlin
@Test
fun activityRecreation_preservesViewModelData() {
    val scenario = ActivityScenario.launch(SearchActivity::class.java)

    scenario.onActivity { activity ->
        activity.viewModel.onQueryChanged("kotlin coroutines")
    }

    // Simulate configuration change
    scenario.recreate()

    scenario.onActivity { activity ->
        assertEquals("kotlin coroutines",
            activity.viewModel.searchQuery.value)
    }
}
```

You can move the Activity to specific states with `moveToState(Lifecycle.State.CREATED)` to test behavior at each stage. For Fragments, `FragmentScenario` provides the same capabilities.

### Common Follow-ups

- What data should go in `onSaveInstanceState` Bundle vs. ViewModel vs. a local database?
- How do you handle a deep link that arrives via `onNewIntent` when the Activity's ViewModel has stale data?
- What happens if you call `finish()` in `onResume`? Does `onPause` and `onStop` still get called?
- How does `ViewModel` scoping change when you use Jetpack Navigation's nested graphs?
- Can you give an example of a memory leak caused by observing `LiveData` with `this` instead of `viewLifecycleOwner`?
- How does `rememberSaveable` in Jetpack Compose relate to `onSaveInstanceState`?
- What's the difference between `FragmentTransaction.add()` and `FragmentTransaction.replace()` in terms of lifecycle?
- How do you pass data between a parent Fragment and a child Fragment using the Result API?
