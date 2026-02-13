---
title: "Activity & Fragment Lifecycle — Top Interview Questions"
date: 2026-02-13
layout: interview
tags: [Technical Round]
order: 1
---

## Activity & Fragment Lifecycle — What Interviewers Really Ask

Lifecycle is the single most asked topic in Android interviews. Every company — from startups to Google — will ask at least 2-3 lifecycle questions. They're testing whether you actually understand how the framework manages your components or if you've just memorized a diagram.

### 🔑 Core Questions (Beginner → Intermediate)

**Q1: Walk me through the Activity lifecycle callbacks and what each one is meant for.**

This is almost always the opening question. Interviewers aren't looking for a recitation — they want to see if you understand the *purpose* behind each callback.

- **onCreate** — Activity enters the Created state. This is where all one-time initialization happens: calling `setContentView()`, binding to a ViewModel, restoring saved state from the `Bundle`. It receives a `savedInstanceState` parameter that's null on first launch and non-null when recreated.
- **onStart** — Activity becomes visible to the user but isn't interactive yet. Good place for UI-related initialization that should happen every time the Activity becomes visible.
- **onResume** — Activity is in the foreground and the user can interact with it. Acquire resources that only make sense when the user is actively engaged — camera preview, sensor listeners, fine-grained location.
- **onPause** — First signal the user is leaving. The Activity may still be partially visible (think multi-window or a dialog on top). Release battery-draining resources like sensors and GPS. Keep it lightweight — don't do database writes or network calls here because this callback is brief.
- **onStop** — Activity is no longer visible at all. This is where you should persist data, stop animations, and release heavier resources. Unlike `onPause`, you have enough time here for CPU-intensive operations.
- **onDestroy** — Final cleanup before the Activity is gone. Called either because the user is finishing the Activity or because the system is destroying it for a configuration change. You can check `isFinishing()` to distinguish between the two.

A common mistake candidates make: treating `onPause` and `onStop` as interchangeable. In multi-window mode, your Activity can be fully visible while paused — if you release your camera in `onPause`, users in split-screen will see a blank preview.

**Q2: Why do we call setContentView() only in onCreate?**

Interviewers ask this to see if you understand that `onCreate` is invoked only once per Activity instance. The view hierarchy is set up once — there's no reason to inflate it again in `onStart` or `onResume`. Setting it in `onCreate` also means the views are available for subsequent lifecycle callbacks like `onStart` and `onRestoreInstanceState`. If you inflated in `onResume`, you'd re-inflate the entire view tree every time the user returned to the Activity, which would be expensive and would wipe out any view state.

**Q3: What happens when the user rotates the device? Walk through the exact callback order.**

This is a configuration change question. The system destroys and recreates the Activity. The exact sequence on API 28+ is:

`onPause` → `onStop` → `onSaveInstanceState` → `onDestroy` → `onCreate` → `onStart` → `onRestoreInstanceState` → `onResume`

The key detail interviewers listen for: on API 28+, `onSaveInstanceState` is called after `onStop`. On older APIs (pre-28), it was called before `onStop`. Most modern apps target API 28+ so the "after onStop" ordering is what you'll encounter. And `onRestoreInstanceState` is called after `onStart`, not inside `onCreate`. You *can* restore state in `onCreate` using the `savedInstanceState` bundle, but `onRestoreInstanceState` has the advantage that it's only called when there's actually saved state to restore — no null check needed.

**Q4: When does onDestroy get called without onPause and onStop being called first?**

When you call `finish()` inside `onCreate`. The system skips directly to `onDestroy` because the Activity never reached the Started or Resumed state. This is a classic gotcha question — it tests whether you understand that lifecycle callbacks are tied to state transitions, not a fixed sequence that always runs top-to-bottom.

**Q5: What is the difference between onSaveInstanceState and onRestoreInstanceState?**

`onSaveInstanceState` is called before the Activity is destroyed (after `onStop` on API 28+, before `onStop` on older APIs). You use it to save transient UI state — scroll position, text input, toggle states — into a `Bundle`. The default implementation already saves the View hierarchy state automatically (like `EditText` content).

`onRestoreInstanceState` is called after `onStart` when the Activity is being recreated from that saved state. The important detail: it's **only** called when there's actually a saved state `Bundle`. If the Activity is starting fresh, this callback is never invoked.

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

Common mistake: saving large objects in the `Bundle`. The `Bundle` is serialized to Binder transactions, which have a ~1 MB limit. Save only lightweight identifiers — store the actual data in a `ViewModel` or local database.

**Q6: List the Fragment lifecycle callbacks in order. How do they differ from Activity?**

Fragments have 12 lifecycle methods compared to Activity's 6. The full order is:

`onAttach` → `onCreate` → `onCreateView` → `onViewCreated` → `onActivityCreated` (deprecated) → `onStart` → `onResume` → `onPause` → `onStop` → `onDestroyView` → `onDestroy` → `onDetach`

The six additional callbacks compared to Activity: `onAttach` (Fragment is associated with its host Activity), `onCreateView` (inflate or create the Fragment's view hierarchy), `onViewCreated` (view is ready, set up observers and adapters here), `onActivityCreated` (deprecated — was for when the host Activity's `onCreate` finished), `onDestroyView` (view is being removed but the Fragment itself may still exist), and `onDetach` (Fragment is disassociated from the host Activity).

The critical thing to understand: a Fragment can have its view destroyed while the Fragment itself survives. This happens when you navigate away in a FragmentTransaction with `addToBackStack` — `onDestroyView` is called, but `onDestroy` and `onDetach` are not. When the user presses back, `onCreateView` and `onViewCreated` run again with the same Fragment instance.

**Q7: Why should Fragments only use the default (no-argument) constructor?**

The system needs the default constructor for Fragment restoration. When a configuration change happens or the system kills your process, the `FragmentManager` recreates Fragments using reflection — it calls `Class.newInstance()`, which requires a public no-arg constructor. If you pass data through a custom constructor, that data is lost on recreation.

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

The `arguments` Bundle is automatically saved and restored by the `FragmentManager`. Custom constructors will compile and run, but your app will crash after a configuration change or process death when the system tries to recreate the Fragment.

**Q8: What is viewLifecycleOwner in a Fragment and why does it matter?**

A Fragment has two separate `Lifecycle` objects: one for the Fragment itself (`this`) and one for its view (`viewLifecycleOwner`). They're different because the Fragment's view can be destroyed and recreated while the Fragment object stays alive (e.g., navigating away and coming back via back stack).

When observing `LiveData` or collecting `Flow` in a Fragment, you should use `viewLifecycleOwner` instead of `this`:

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

If you observe with `this`, the observer stays active even after `onDestroyView`. When `onCreateView` runs again, you register a *second* observer — now you have two observers updating the same UI, causing duplicate updates, stale references, and potential crashes.

**Q9: How does ViewModel survive configuration changes?**

This is one of the most important questions because it tests whether you understand the mechanism, not just the fact. The `ComponentActivity` implements `ViewModelStoreOwner` and holds a `ViewModelStore` — essentially a `HashMap<String, ViewModel>`. During a configuration change, the framework retains this `ViewModelStore` through `NonConfigurationInstances`, a special object the system preserves across Activity recreation.

When the new Activity instance is created after rotation, it retrieves the same `ViewModelStore` from the retained `NonConfigurationInstances`, and your `ViewModel` instances are still there with all their data intact. The `ViewModel` is only cleared (via `onCleared()`) when the `ViewModelStoreOwner` is permanently destroyed — meaning `finish()` was called, the user navigated away, or the Fragment was detached for good.

**Q10: What's the difference between ViewModel and SavedStateHandle? When do you need both?**

`ViewModel` survives configuration changes (rotation, language change) but does **not** survive process death. If the system kills your app while it's in the background, the `ViewModel` and all its in-memory data are gone.

`SavedStateHandle` survives both configuration changes and process death. Under the hood, it's backed by the `savedInstanceState` Bundle mechanism — same as `onSaveInstanceState`, but accessible from within the ViewModel.

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

You need both: `SavedStateHandle` for lightweight state the user would expect to survive (search query, scroll position, selected tab), and regular ViewModel state for data that can be re-fetched (API results, repository data). The rule of thumb: if losing the data would confuse the user, put it in `SavedStateHandle`.

### 🧠 Deep Dive Questions (Advanced → Expert)

**Q11: Explain the Activity transition lifecycle — what happens when Activity A starts Activity B?**

The callback sequence overlaps, and this is where many candidates get tripped up:

1. **Activity A: `onPause()`** — A loses foreground but may still be visible
2. **Activity B: `onCreate()`** → **`onStart()`** → **`onResume()`** — B fully initializes and takes focus
3. **Activity A: `onStop()`** — A is now completely hidden behind B

The critical design implication: never put long-running operations in `onPause` because they delay the next Activity from appearing. If A's `onPause` takes 500ms, the user stares at a frozen screen for 500ms before B shows up. Interviewers test this to see if you've ever debugged slow Activity transitions in production.

**Q12: What happens during process death? How is it different from a configuration change?**

During a configuration change, the system destroys and immediately recreates your Activity — the process stays alive, `ViewModel` survives, and `onSaveInstanceState`/`onRestoreInstanceState` handle the UI state.

Process death is different. The system kills the entire Linux process — every Activity, every Service, every ViewModel, every in-memory object is gone. There's no `onDestroy` callback because the process is killed forcefully. The `Bundle` from `onSaveInstanceState` is the only thing that survives because the system stores it outside your process.

When the user taps your app from the Recents screen, the system recreates the Activity with the saved `Bundle`. Your `ViewModel` is a fresh instance. Any data you only stored in the `ViewModel` is lost. This is why `SavedStateHandle` exists — it bridges the gap between ViewModel's in-memory state and the Bundle's process-death-safe persistence.

You can simulate process death in Android Studio via "Terminate Application" in the device Logcat while the app is backgrounded, or use `adb shell am kill <package>`. Testing this is essential because process death is common on low-memory devices and nearly impossible to reproduce by accident during development.

**Q13: Explain onNewIntent. When is it called and with which launch modes?**

`onNewIntent` is called when an Activity receives a new `Intent` without being recreated. This happens with specific launch modes:

- **singleTop** — If the Activity is already at the top of the task stack, the system calls `onNewIntent` instead of creating a new instance. The sequence is `onNewIntent` → `onResume` (if the Activity was paused).
- **singleTask** — If the Activity exists anywhere in the task, it's brought to the top and all Activities above it are destroyed. `onNewIntent` delivers the new Intent.
- **singleInstance** — Similar to `singleTask` but the Activity is always the only member of its task.

A common bug: forgetting that `getIntent()` still returns the *original* Intent after `onNewIntent`. You must call `setIntent(newIntent)` explicitly:

```kotlin
override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)  // Update so getIntent() returns the new one
    handleDeepLink(intent)
}
```

This trips up even experienced developers when implementing deep links — the deep link works on first launch but silently fails when the Activity already exists.

**Q14: How does multi-window mode affect the Activity lifecycle?**

In multi-window (split-screen) mode, only one Activity has focus at a time. The other Activity is in the Paused state — but it's still *fully visible*. This breaks the assumption that "paused means partially or not visible." Before multi-window, `onPause` and "no longer visible" were practically synonymous. Now they're not.

The practical consequence: if you release your camera, pause video playback, or stop animations in `onPause`, users in split-screen see a frozen or blank screen. The fix is to move those operations to `onStop` (which means the Activity is genuinely no longer visible). If you need your camera active during multi-window, initialize it in `onStart` and release in `onStop`.

Picture-in-Picture (PiP) follows the same principle — the Activity enters PiP and receives `onPause` but is still visible as a floating window. Interactive elements should be disabled, but playback should continue.

**Q15: What is setRetainInstance(true) on a Fragment, and why is it deprecated?**

`setRetainInstance(true)` told the `FragmentManager` to keep the Fragment instance alive across configuration changes. The Fragment would skip `onDestroy` and `onDetach` during rotation — it would go through `onDestroyView` → `onCreateView` instead of the full destruction cycle. This was the pre-ViewModel solution for retaining expensive objects across configuration changes.

It's deprecated because `ViewModel` does the same job better and without the baggage. Retained Fragments had problems: they couldn't be added to the back stack, they complicated the already complex Fragment lifecycle, and they mixed data retention with UI logic. `ViewModel` cleanly separates the concern — it holds data, the Fragment manages UI, and neither one leaks into the other's responsibilities.

**Q16: Explain the difference between FragmentPagerAdapter and FragmentStatePagerAdapter.**

Both are deprecated in favor of `ViewPager2` with `FragmentStateAdapter`, but interviewers still ask this because it tests your understanding of Fragment lifecycle management.

**FragmentPagerAdapter** keeps every Fragment instance in memory. When you swipe away from a page, the Fragment is detached (`onDestroyView` is called) but not destroyed. For a ViewPager with 5 tabs, all 5 Fragment instances live in memory permanently. Good for a small, fixed number of pages — bad for a list of 100 items.

**FragmentStatePagerAdapter** destroys Fragments when they're off-screen. It saves the Fragment's state via `onSaveInstanceState` and recreates the Fragment from scratch when the user swipes back. Only the currently visible Fragment (and its immediate neighbors based on `offscreenPageLimit`) are alive. This is what you want for large datasets or dynamic lists.

The modern replacement, `ViewPager2`'s `FragmentStateAdapter`, behaves like `FragmentStatePagerAdapter` — it destroys and recreates Fragments based on the `RecyclerView` recycling mechanism under the hood.

**Q17: How does ViewModel scoping work? What's a ViewModelStoreOwner?**

`ViewModelStoreOwner` is an interface with a single method: `getViewModelStore()`. Three classes in the framework implement it:

- **ComponentActivity** — ViewModel lives until `finish()` is called
- **Fragment** — ViewModel lives until the Fragment is permanently detached
- **NavBackStackEntry** — ViewModel lives until the destination is popped from the navigation back stack

When you call `ViewModelProvider(owner).get(MyViewModel::class.java)`, it looks up or creates the ViewModel in that owner's `ViewModelStore`. This is why you can share a ViewModel between Fragments — if both Fragments use the Activity as the owner, they get the same ViewModel instance:

```kotlin
// In FragmentA — scoped to the Activity
val sharedViewModel: OrderViewModel by activityViewModels()

// In FragmentB — same ViewModel instance
val sharedViewModel: OrderViewModel by activityViewModels()

// In FragmentC — scoped to the Fragment itself (different instance)
val localViewModel: OrderViewModel by viewModels()
```

With Navigation Component, you can also scope to a navigation graph, which is cleaner than Activity scoping because the ViewModel gets cleared when the user leaves that navigation flow, not when the entire Activity finishes.

**Q18: What are lifecycle-aware components? How do LifecycleObserver and DefaultLifecycleObserver work?**

Lifecycle-aware components observe the lifecycle without holding direct references to Activities or Fragments. The Lifecycle API has two pieces: `LifecycleOwner` (Activities, Fragments, and viewLifecycleOwner implement this) and `LifecycleObserver` (your components implement this to react to lifecycle events).

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

The power here is decoupling: the `LocationTracker` manages its own lifecycle without the Activity knowing anything about location logic. No more forgetting to unregister callbacks in `onStop` — the observer handles it automatically. This is the pattern behind most Jetpack libraries like `LiveData`, `WorkManager`, and `ProcessLifecycleOwner`.

**Q19: What is ProcessLifecycleOwner and when would you use it?**

`ProcessLifecycleOwner` provides a `Lifecycle` for the entire application process, not individual Activities. It moves to `ON_START` when the *first* Activity becomes visible and moves to `ON_STOP` when the *last* Activity becomes invisible. It effectively tells you whether your app is in the foreground or background.

The `ON_DESTROY` event is never dispatched by `ProcessLifecycleOwner` — since process death can happen without warning, there's no reliable way to fire this event. It dispatches `ON_CREATE` only once when the process starts.

Common use case: detecting app foreground/background transitions for analytics, pausing/resuming a WebSocket connection, or refreshing auth tokens when the user returns to the app. It's a cleaner alternative to counting Activity starts and stops yourself.

**Q20: How would you test Activity lifecycle behavior?**

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

You can also move the Activity to specific states with `moveToState(Lifecycle.State.CREATED)` to test behavior at each lifecycle stage. For Fragment testing, `FragmentScenario` provides the same capabilities. The key thing interviewers care about: can you test lifecycle edge cases like recreation, process death simulation, and state restoration without relying on manual device rotation?

**Q21: What is the Fragment Result API and how does it replace Fragment-to-Fragment communication?**

The Fragment Result API (`setFragmentResult` / `setFragmentResultListener`) was introduced to replace the old pattern of communicating between Fragments via shared ViewModels or callback interfaces. It uses the `FragmentManager` as a mediator:

```kotlin
// FragmentA — listening for a result
setFragmentResultListener("filter_request") { requestKey, bundle ->
    val selectedFilter = bundle.getString("selected_filter")
    applyFilter(selectedFilter)
}

// FragmentB — sending a result
setFragmentResult("filter_request", bundleOf("selected_filter" to "price_low"))
```

The result is delivered when the listener's Fragment is in `STARTED` state or later. If FragmentB sets a result while FragmentA is stopped, the result is delivered when FragmentA reaches `STARTED` again. Only the latest result is kept for each key — setting a new result with the same key replaces the previous one. This API is lifecycle-aware and avoids the pitfalls of direct Fragment references or shared ViewModel abuse for simple data passing.

**Q22: Explain the relationship between Fragment lifecycle and Activity lifecycle. Can a Fragment's state exceed its host Activity's state?**

A Fragment can never have a lifecycle state that exceeds its host `FragmentManager`'s state, which is constrained by the Activity. If the Activity is in `STARTED` state, no Fragment can be in `RESUMED` state. The parent must be started before any child Fragment can be started.

The reverse also applies on the way down: child Fragments must be stopped before their parent Activity stops. This forms a strict containment hierarchy. You can further restrict a Fragment's maximum lifecycle state using `setMaxLifecycle()` on the FragmentTransaction — this is exactly how `ViewPager2`'s `FragmentStateAdapter` works. It sets off-screen Fragments to `STARTED` state maximum, so they never reach `RESUMED` and don't consume resources intended for the visible page.

One common source of bugs: using the `<fragment>` XML tag instead of `FragmentContainerView`. The `<fragment>` tag can allow Fragments to exceed their FragmentManager's state during initialization. `FragmentContainerView` is the recommended replacement and enforces proper lifecycle ordering.

### 💡 Common Follow-ups

- What data should go in `onSaveInstanceState` Bundle vs. ViewModel vs. a local database?
- How do you handle a deep link that arrives via `onNewIntent` when the Activity's ViewModel has stale data?
- What happens if you call `finish()` in `onResume`? Does `onPause` and `onStop` still get called?
- How does `ViewModel` scoping change when you use Jetpack Navigation's nested graphs?
- Can you give an example of a memory leak caused by observing `LiveData` with `this` instead of `viewLifecycleOwner`?
- How does `rememberSaveable` in Jetpack Compose relate to `onSaveInstanceState`?
- What's the difference between `FragmentTransaction.add()` and `FragmentTransaction.replace()` in terms of lifecycle?
- How do you pass data between a parent Fragment and a child Fragment using the Result API?

### ✅ Tips for the Interview

1. **Draw the lifecycle diagram from memory** — Practice drawing the Activity and Fragment lifecycle on a whiteboard. Interviewers love visual thinkers. Start with the happy path (launch → foreground → background → destroy), then overlay configuration change and process death flows.

2. **Always mention the "why"** — Don't just say "onStop is called when the Activity is no longer visible." Explain *why that matters*: "This is where I'd save data to a database because the Activity might be killed next without `onDestroy` being called."

3. **Know the multi-window edge case** — Many candidates answer lifecycle questions correctly for the single-window case but fail when the interviewer asks about split-screen. The `onPause` does not mean invisible distinction is a strong signal of real-world experience.

4. **Understand ViewModel internals, not just usage** — Saying "ViewModel survives rotation" is junior-level. Saying "ViewModel is stored in ViewModelStore, which is retained through NonConfigurationInstances during configuration changes" is senior-level.

5. **Test your knowledge by simulating process death** — Before the interview, actually use `adb shell am kill` on your own apps. See what breaks. Candidates who've done this give noticeably better answers about SavedStateHandle and state restoration because they've felt the pain firsthand.

---

*Lifecycle is one of those topics where the difference between a good answer and a great answer is understanding the mechanism, not just the callbacks. Know the "why" behind every state transition and you'll stand out.*
