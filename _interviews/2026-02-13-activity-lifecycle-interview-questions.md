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

Think of an Activity like opening a restaurant for the day. Each callback is a stage in that process:

- **onCreate** — You build the restaurant. Called once per Activity instance. This is where you call `setContentView()`, set up your ViewModel, and restore any saved state from the Bundle. Everything gets constructed here.
- **onStart** — You flip the "Open" sign. The Activity is now visible but nobody can interact with it yet. UI setup that needs to happen every time the Activity appears goes here.
- **onResume** — Doors are open, customers are walking in. The Activity is in the foreground and fully interactive. Acquire resources like camera, sensors, and location updates here.
- **onPause** — Last call. The user is leaving, but the Activity may still be partially visible (think multi-window or a dialog sitting on top). Release battery-draining resources, but keep it lightweight.
- **onStop** — Lights off, nobody can see you. The Activity is no longer visible. Persist data, stop animations, release heavier resources. Unlike `onPause`, you actually have time for CPU-intensive work here.
- **onDestroy** — Demolition day. Final cleanup. This fires either because the user finished the Activity or the system destroyed it for a configuration change. Call `isFinishing()` to tell them apart.

#### What happens when the user rotates the device?

Rotation is a configuration change, and the system handles it by tearing down the Activity and building it back up from scratch. It's like knocking down a house and rebuilding it because you wanted landscape windows. Dramatic, but that's how it works.

The callback order on API 28+ is:

`onPause` → `onStop` → `onSaveInstanceState` → `onDestroy` → `onCreate` → `onStart` → `onRestoreInstanceState` → `onResume`

On API 28+, `onSaveInstanceState` is called after `onStop`. On older APIs, it was called before `onStop`. `onRestoreInstanceState` is only called when there's actually saved state to restore, so no null check needed on that Bundle parameter.

#### What is the difference between onSaveInstanceState and onRestoreInstanceState?

`onSaveInstanceState` is your "pack the suitcase" moment. Before the Activity gets destroyed, you stuff transient UI state into a `Bundle` — scroll position, text input, toggle states. The default implementation already saves View hierarchy state automatically (like `EditText` content), which is nice.

`onRestoreInstanceState` is "unpack the suitcase." It's called after `onStart` when the Activity is being recreated. Here's the key part: it's only called when there's actually a saved state Bundle. If the Activity is starting fresh, this callback never fires.

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

One thing that catches people off guard: don't shove large objects into the Bundle. It's serialized to Binder transactions which have a ~1 MB limit. Save lightweight identifiers and keep the actual data in a ViewModel or local database.

#### How does ViewModel survive configuration changes?

This one is cool once you see how it works under the hood. `ComponentActivity` holds a `ViewModelStore`, which is basically a `HashMap<String, ViewModel>`. During a configuration change, the framework retains this store through `NonConfigurationInstances` — a special object the system preserves across Activity recreation.

Think of it like a safe deposit box at the bank. The bank (Activity) can burn down and be rebuilt, but the safe deposit box (ViewModelStore) is kept separately by the city (framework). When the new bank opens, it gets access to the same box.

When the new Activity instance is created after rotation, it retrieves the same `ViewModelStore`, so all ViewModel instances are still there with their data. The ViewModel is only cleared via `onCleared()` when the owner is permanently destroyed — `finish()` was called or the user navigated away.

#### What happens when Activity A starts Activity B? Walk through the callback order.

> **🧠 Think about it:** Does Activity A fully stop before Activity B starts, or do their lifecycles overlap?

The callbacks actually interleave between the two Activities:

1. **Activity A: `onPause()`** — A loses foreground but may still be visible
2. **Activity B: `onCreate()`** → **`onStart()`** → **`onResume()`** — B fully initializes and takes focus
3. **Activity A: `onStop()`** — A is completely hidden behind B

Notice how A doesn't `onStop` until B is fully up and running. This is intentional — the system keeps A visible until B is ready to take over. But here's the gotcha: heavy work in `onPause` delays the next Activity from appearing. If A's `onPause` takes 500ms, the user sees a frozen screen for that long before B shows up.

#### What happens during process death? How is it different from a configuration change?

During a configuration change, the system destroys and immediately recreates the Activity. The process stays alive and ViewModel survives. It's like remodeling a room — everything else in the house stays intact.

Process death is a completely different beast. The system kills the entire Linux process. Every Activity, Service, ViewModel, and in-memory object is gone. There's no `onDestroy` callback — the process is killed forcefully. It's like an asteroid hitting the house. The only thing that survives is the Bundle from `onSaveInstanceState`, because the system stores it outside the process, like a backup in the cloud.

When the user returns from Recents, the system recreates the Activity with the saved Bundle and a fresh ViewModel. Any data only stored in the ViewModel is lost. You can simulate process death with "Terminate Application" in Logcat or `adb shell am kill <package>`.

#### What's the difference between ViewModel and SavedStateHandle?

Yeah, this trips people up all the time. Here's the simple version:

`ViewModel` survives configuration changes but not process death. If the system kills your app in the background, the ViewModel and all its data are gone.

`SavedStateHandle` survives both configuration changes and process death. It's backed by the `savedInstanceState` Bundle mechanism, but accessible from inside the ViewModel so you don't have to wire everything through the Activity.

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

The rule of thumb: use `SavedStateHandle` for state the user expects to survive — search query, scroll position, selected tab. Use regular ViewModel state for data that can be re-fetched like API results.

#### List the Fragment lifecycle callbacks. How do they differ from Activity?

Fragments have the Activity lifecycle plus a few extras bolted on for the view layer. The full order is:

`onAttach` → `onCreate` → `onCreateView` → `onViewCreated` → `onStart` → `onResume` → `onPause` → `onStop` → `onDestroyView` → `onDestroy` → `onDetach`

The extra callbacks compared to Activity:
- **onAttach** — Fragment is associated with its host Activity
- **onCreateView** — Inflate the Fragment's view hierarchy
- **onViewCreated** — View is ready. Set up observers and adapters here
- **onDestroyView** — View is removed but the Fragment itself may still exist
- **onDetach** — Fragment is disassociated from the host Activity

Here's the part that makes Fragments tricky: a Fragment can have its view destroyed while the Fragment itself survives. This happens with `addToBackStack` — `onDestroyView` is called, but `onDestroy` and `onDetach` are not. When the user presses back, `onCreateView` and `onViewCreated` run again with the same Fragment instance. It's like stripping the wallpaper off a room without demolishing the walls.

#### What is viewLifecycleOwner in a Fragment and why does it matter?

A Fragment actually has two Lifecycle objects — one for the Fragment itself (`this`) and one for its view (`viewLifecycleOwner`). The view can be destroyed and recreated while the Fragment object stays alive, like when navigating away and coming back via the back stack.

When observing LiveData or collecting Flow in a Fragment, always use `viewLifecycleOwner`:

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

If you observe with `this`, the observer stays active after `onDestroyView`. When `onCreateView` runs again, you register a second observer — causing duplicate updates, stale references, and potential crashes. It's like subscribing to a newsletter every time you visit a website but never unsubscribing. Eventually your inbox is chaos.

#### Why should Fragments only use the default no-argument constructor?

The system needs the default constructor for Fragment restoration. During configuration changes or process death, the `FragmentManager` recreates Fragments using reflection with `Class.newInstance()`, which requires a public no-arg constructor. Any data passed through a custom constructor is just gone.

Use `setArguments()` with a Bundle instead — think of it as packing a carry-on bag that the airline guarantees will arrive with you:

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

The `arguments` Bundle is automatically saved and restored by the FragmentManager. Custom constructors will compile just fine, but the app crashes after recreation when the system can't find the no-arg constructor. It compiles, ships, and then blows up in production. Fun times.

#### Why do I call setContentView() only in onCreate?

`onCreate` is called once per Activity instance, so the view hierarchy only needs to be set up once. Setting it here also means views are available for subsequent callbacks like `onStart` and `onRestoreInstanceState`. If you inflated in `onResume`, you'd re-inflate the entire view tree every time the user returned — that's expensive and it wipes out all your view state.

#### Explain onNewIntent. When is it called?

`onNewIntent` is called when an Activity receives a new Intent without being recreated. It's like someone slipping a new letter under your door instead of making you move to a new house. This happens with specific launch modes:

- **singleTop** — Activity is at the top of the stack, so the system calls `onNewIntent` instead of creating a new instance
- **singleTask** — Activity exists anywhere in the task. It's brought to the top and all Activities above it are destroyed
- **singleInstance** — Same as singleTask but the Activity is always the only member of its task

Here's a subtle trap: `getIntent()` still returns the original Intent after `onNewIntent`. You must call `setIntent(newIntent)` explicitly:

```kotlin
override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleDeepLink(intent)
}
```

Without `setIntent()`, deep links work on first launch but silently fail when the Activity already exists. Good luck debugging that one without knowing this.

#### When does onDestroy get called without onPause and onStop?

When you call `finish()` inside `onCreate`. The system skips directly to `onDestroy` because the Activity never reached the Started or Resumed state. Lifecycle callbacks are tied to state transitions, not a fixed sequence — if you never entered a state, you never exit it.

> **🧠 Think about it:** If lifecycle callbacks are tied to state transitions, what happens if you call `finish()` in `onResume` instead? Does `onPause` get called then?

#### How does multi-window mode affect the lifecycle?

In split-screen, only one Activity has focus. The other is in the Paused state but still fully visible. So `onPause` does not mean the Activity is no longer visible. This breaks the assumption a lot of developers carry around.

If you release the camera or stop animations in `onPause`, split-screen users see a frozen or blank screen. Move those operations to `onStop`, which genuinely means the Activity is not visible. Initialize camera in `onStart` and release in `onStop`.

Picture-in-Picture follows the same rule — the Activity receives `onPause` but stays visible as a floating window. Playback should continue. If your video player pauses in `onPause`, PiP mode becomes useless.

#### How does ViewModel scoping work?

`ViewModelStoreOwner` is an interface with one method: `getViewModelStore()`. Three classes implement it:

- **ComponentActivity** — ViewModel lives until `finish()` is called
- **Fragment** — ViewModel lives until the Fragment is permanently detached
- **NavBackStackEntry** — ViewModel lives until the destination is popped from the back stack

Think of scoping like renting an office. The ViewModel's lease lasts as long as the owner exists. When both Fragments use the Activity as the owner, they share the same ViewModel — same office, two tenants:

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

Lifecycle-aware components observe the lifecycle without holding direct references to Activities or Fragments. Instead of the Activity telling the component "hey, I'm stopping now," the component watches the lifecycle and reacts on its own. It's the observer pattern applied to lifecycle management.

> **🧠 Think about it:** Why is it better for a component to observe the lifecycle itself, rather than having the Activity call start/stop methods on it directly?

The API has two pieces — `LifecycleOwner` (implemented by Activities and Fragments) and `LifecycleObserver` (your components implement this). `DefaultLifecycleObserver` is the recommended approach:

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

The LocationTracker manages its own lifecycle without the Activity knowing anything about location logic. This is the pattern behind LiveData, WorkManager, and ProcessLifecycleOwner.

#### Can a Fragment's lifecycle state exceed its host Activity's state?

No. A Fragment can never have a lifecycle state higher than its host FragmentManager's state, which is constrained by the Activity. If the Activity is in `STARTED` state, no Fragment can be in `RESUMED` state. The child can never outrank the parent.

You can further restrict a Fragment's maximum state using `setMaxLifecycle()`. This is exactly how ViewPager2's FragmentStateAdapter works — it sets off-screen Fragments to `STARTED` so they never reach `RESUMED`.

Use `FragmentContainerView` instead of the `<fragment>` XML tag. The `<fragment>` tag can allow Fragments to exceed their FragmentManager's state during initialization, which is a bug waiting to happen.

#### What is the Fragment Result API?

The Fragment Result API replaces the old ways of communicating between Fragments — shared ViewModels, callback interfaces, all that messy coupling. It uses the FragmentManager as a postal service between Fragments:

```kotlin
// FragmentA — listening for a result
setFragmentResultListener("filter_request") { requestKey, bundle ->
    val selectedFilter = bundle.getString("selected_filter")
    applyFilter(selectedFilter)
}

// FragmentB — sending a result
setFragmentResult("filter_request", bundleOf("selected_filter" to "price_low"))
```

The result is delivered when the listener's Fragment is in `STARTED` state or later. Only the latest result is kept per key — setting a new result replaces the previous one. This API is lifecycle-aware and avoids direct Fragment references, which means no leaked references and no crashes from talking to a dead Fragment.

#### What is setRetainInstance(true) and why is it deprecated?

`setRetainInstance(true)` told the FragmentManager to keep the Fragment instance alive across configuration changes. The Fragment would skip `onDestroy` and `onDetach` during rotation and go through `onDestroyView` → `onCreateView` instead.

It's deprecated because ViewModel does the same job better and without the baggage. Retained Fragments couldn't be added to the back stack, made the lifecycle harder to reason about, and mixed data retention with UI logic. ViewModel cleanly separates those concerns.

#### What is ProcessLifecycleOwner?

`ProcessLifecycleOwner` provides a Lifecycle for the entire application process, not individual Activities. It moves to `ON_START` when the first Activity becomes visible and `ON_STOP` when the last Activity becomes invisible. Basically, it tells you whether your app is in the foreground or background — something that's surprisingly hard to figure out otherwise.

`ON_DESTROY` is never dispatched because process death happens without warning — there's nobody around to receive the callback. `ON_CREATE` is dispatched only once when the process starts. Common use cases are foreground/background detection for analytics, pausing WebSocket connections, or refreshing auth tokens when the user returns.

#### What's the difference between FragmentTransaction add() and replace()?

`add()` stacks the new Fragment on top of the existing one. The existing Fragment stays in its current lifecycle state — it doesn't get `onPause` or `onStop` unless you explicitly hide it. Both Fragments coexist in the container, like stacking transparencies on an overhead projector.

`replace()` removes the existing Fragment and adds the new one. The old Fragment goes through `onDestroyView` (and `onDestroy` if not on the back stack). If you called `addToBackStack()`, pressing back will recreate the old Fragment's view.

Use `replace()` for most navigation. Use `add()` when you need to overlay Fragments like bottom sheets or dialogs.

#### How do you test Activity lifecycle behavior?

`ActivityScenario` from `androidx.test` gives you programmatic control over lifecycle state. You can spin up an Activity, poke at it, simulate a configuration change, and verify everything survived — all in a test:

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
