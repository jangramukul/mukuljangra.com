---
title: Compose Beyond The UI?
layout: post
categories: post
tags:
  - Android
  - Kotlin
---

A few years ago, I remember managing almost everything with `Threads`, `AsyncTask`, and `Handlers` for background tasks and UI updates. It was messy. Think of it like running a restaurant kitchen where every single dish had its own dedicated chef, its own oven, and its own timer — and none of them talked to each other. You'd be juggling callbacks inside callbacks, hoping nothing blew up on a background thread. That was writing business logic on Android.

Then RxJava showed up and gave us a much nicer way to handle asynchronous tasks with its operators. You could map, filter, and combine streams of data. For years, this was the preferred way to write presenters and viewmodels. But here's the thing — your actual business logic got buried under a mountain of operators. You'd open a presenter file and think, "Wait, where's the logic? All I see is `flatMap`, `switchMap`, `observeOn`, `subscribeOn`..." The code worked, but reading it felt like deciphering a puzzle.

Around 2017, Google released LiveData as part of its Architecture Components. It was simpler and lifecycle-aware, which reduced the risk of memory leaks and wasted resources. But at the same time, it was missing lots of operators like RxJava had. So you gained simplicity but lost flexibility.

The next big shift was Kotlin Coroutines. In 2020, we got StateFlow and SharedFlow. StateFlow quickly became the preferred choice over LiveData — it was lifecycle-aware when combined with supported APIs, it integrated nicely with Coroutines, and it came with lots of operators. Because it was part of Kotlin, it felt more natural and simpler than RxJava. And it solved that major problem of complex layers of state management.

Throughout this time, until about 2021, we were using XML for UI. This worked perfectly with the ViewModel or presenters pattern. Our XML-based UI was stateless and largely state was defined in ViewModel or presenters.

Then, Jetpack Compose arrived. Compose made writing UI cleaner, more concise, and declarative. But what was once very simple in XML, like initializing a ViewModel or managing a text field's state, could now feel more complex in Compose. We had to learn new rules to avoid side-effects and understand how state flowed through composable functions. Still to this day, the architecture decision of managing few things feels like a downgrade. Even recompositions, managing field states etc. feels more complex which were quite easy in XML. But definitely, there are lots of nice things from Compose which has made writing clean UI by reducing the complex layers.

Now, after the traditional ways of writing viewmodel or presenters using coroutines, new architecture and patterns are floating around like Circuit, Molecule etc. But before jumping into those, I think it's worth understanding what Compose actually is under the hood. Because it's not just a UI toolkit. And that right there is the sentence that changes everything about how you think about Compose.

## Compose Runtime vs Compose UI

Most of us think of Compose as a UI framework. And that's fair — it's how Google markets it and how we use it daily. But here's the thing: **Compose is actually two separate projects layered on top of each other.** The Compose compiler and runtime sit at the bottom, and Compose UI sits on top.

Think of it like a car engine versus the car body. The engine (the runtime) is a general-purpose machine that converts fuel into motion. The body (Compose UI) is what shapes that motion into a sedan or an SUV. You could take that same engine and put it in a boat. The engine doesn't care — it just does its job. Compose runtime is that engine.

The runtime provides the fundamentals — `remember`, `mutableStateOf`, the `@Composable` annotation, `SideEffect`, and the entire tree management system. It doesn't know or care about pixels, layouts, or canvases. As Jake Wharton put it, **"Compose is, at its core, a general-purpose tool for managing a tree of nodes of any type."** Those nodes could be UI elements, but they could just as easily be data models, presenter states, or any tree structure you can think of.

Compose UI is the layer built on top of this runtime. It takes the runtime's tree management and applies it to rendering — `LayoutNode`, `Modifier`, input handlers, drawing to a canvas. Then Foundation and Material sit even higher, giving us `Row`, `Column`, `Button`, and everything else we use daily. This layering is why you can depend on `androidx.compose.runtime` without pulling in any UI dependencies at all.

Why does this matter? Because it means the Compose runtime — the state tracking, the recomposition engine, the snapshot system — is available for use in places that have nothing to do with rendering UI. And that opens up some really interesting architectural possibilities.

## What the Compose Compiler Actually Does

When you annotate a function with `@Composable`, the Compose compiler plugin transforms it significantly at compile time. It's not just a marker annotation — the compiler rewrites your function's bytecode to support the recomposition system. You write a normal-looking Kotlin function, but what actually runs is something quite different.

The compiler marks composable functions with two key tags: **restartable** and **skippable**. A restartable function can serve as a "scope" where recomposition begins — Compose can re-enter and re-execute code starting from that point when state changes. A skippable function can be entirely skipped during recomposition if all its parameters are equal to their previous values. The compiler also analyzes your types, marking them as **immutable** or **stable**, which determines whether Compose can safely skip recomposition for composables that use those types.

Now here's where it gets interesting. The same compiler plugin works regardless of whether you're building UI or not. When you use `mutableStateOf` in a ViewModel, the compiler and runtime still track reads and writes to that state. When you use `derivedStateOf`, the runtime still knows which states it depends on. The whole state tracking machinery works independently of any UI rendering. This is exactly what makes non-UI use cases possible.

> **💡 The "aha" moment:** The `@Composable` annotation doesn't mean "this draws UI." It means "this function participates in Compose's state tracking and recomposition system." That distinction is everything.

## The Runtime in Non-UI Contexts

Since the Compose runtime is just a state management and tree composition engine, you can run it headlessly — no screen, no canvas, no `LayoutNode`. You just need the Compose compiler plugin applied to your module and a dependency on `androidx.compose.runtime`.

In a non-UI context, the runtime still gives you `remember` for caching values across recompositions, `mutableStateOf` for observable state, `LaunchedEffect` for coroutine side effects, and `snapshotFlow` for bridging compose state into Flow. The recomposition loop still works — it just doesn't draw anything. Instead of producing pixels, your `@Composable` function produces a value, like a state object.

This is the core insight: **a `@Composable` function doesn't have to render content. It can return a value instead.** And every time the state it reads changes, it recomposes and returns a new value. That's the foundation that Molecule and Circuit are built on.

## What's the Problem with Traditional ViewModels?

Imagine your app's main screen. It started simple — a list and a search bar. Then product added filters. Then sorting options. Then a bottom sheet with user preferences. Then real-time updates from a WebSocket. Now your ViewModel looks like a 400-line file full of `combine`, `collectLatest`, `stateIn`, and manual state mutation scattered everywhere. Sound familiar?

As apps grow, their ViewModels or Presenters become huge because of multiple states and UI events which makes the code difficult to read and reduces the code longevity. UDF is useful because it simplifies how state and events should flow and in what direction, but it doesn't automatically solve all the problems that come with complex screens while writing the pipeline.

Libraries like Circuit from Slack and Molecule from Cash App tried to solve this. IMO, these are trying to solve two major problems: how we can properly separate states and UI in a cleaner way, and how we can reduce the complexity of writing business logic in viewmodel.

Cash App has been using presenters (MVP instead of MVVM) for writing the business logic for UI. Simply because presenters just make sense and feels a bit clean and UDF also seems very clear. Initially during the days of Rx, they were used to write presenters with RxJava. Later, moved to coroutines and flow. Now, writing it in compose code seems much cleaner, even than coroutines. Here, I wouldn't go into ViewModel vs presenter. But I would explain the different ways to write the business and the compose way :)

## Ways To Write ViewModel

Right now, there are a few traditional common patterns and ways we write our viewmodel. Let's explore these and understand their pros and cons, and later, let's see if there's anything beyond we can go further. You could skip this part if you're only interested in new architecture instead of traditional viewmodel.

## Single Field

This approach uses individual `StateFlow` fields for each piece of data. Back in few years, this worked well with XML-based view components. It worked well to render the component when a specific state field changed instead of updating the entire hierarchy or entire tree in case when UI state class used. It worked well also in case when you need to filter out a single state or combine one with another state.

The main problem with this pattern? It leads to a proliferation of fields and methods, making the state difficult to reason about as a whole as your screen grows. It's like having a filing cabinet where every single document has its own drawer — you can find each one individually, but good luck understanding how they all relate to each other.

> **Note**: The pipeline assembly must be **lifecycle aware**. Use `collectAsStateWithLifecycle()` in the UI to collect state or `SharingStarted.WhileSubscribed()` while using `stateIn` or `shareIn` in viewmodel to avoid leaking resources.

```kotlin
@Composable
fun LoginScreen(viewModel: LoginViewModel) {
	val username by viewModel.username.collectAsStateWithLifecycle()
	
	Text(
	  modifier = Modifier,
	  text = username,
	)
}

class LoginViewModel: ViewModel() {
    private val _username = MutableStateFlow<String?>("")
    val username = _username.asStateFlow()
    
    private val _name = MutableStateFlow<String?>("")
    val name = _name.asStateFlow()

    fun updateUsername(value: String) {
	  _username.value = value  
    }
    
    fun updateName(value: String) {
	  _name.value = value 
    }
}
```

## UI State Class

This is a more structured method that groups all state into a single data class. I think, for small screens, it fits very well and should be the preferred solution for small and medium-size screens. There are few issues I can see with this approach though. If I have complex logic for filtering and mapping states or fields, it could become complex and doesn't give enough flexibility. For better abstraction, we could create inner classes inside UI state class like grouping few fields and mutating.

But make sure, if you're passing down the UI State class down to composable functions — which I'm sure you will — make sure to use `@Stable` to achieve recomposition safety and avoid direct updating the state without using update function for thread safety. You could inject the entire initial UI state class for easier testing. And it's better to use lifecycle API while collecting the state over the UI to avoid wasting resources and unexpected side effects.

Also, one more problem with this approach is, if I have multiple input sources like observing users from repository or usecase, it could be hard to mutate the state. We need to collect first and then mutate the state. So this works well if the screen is not complex or doesn't involve multiple SSOT from network or database or any complex mapping or filtering logics or checks.

> **Warning**: A critical pitfall to avoid is launching coroutines or performing asynchronous operations in an `init` block because these operations can run before the object is fully initialized, which may throw an `IllegalStateException` when using Compose State.

```kotlin
@Composable
fun LoginScreen(viewModel: LoginViewModel) {
	val state by viewModel.uiState.collectAsStateWithLifecycle()
	
	Text(
	   modifier = Modifier,
	   text = state.username,
	)
}

@Stable
data class LoginUiState(
   val username: String, 
   val name: String,
   val totalUsers: Int,
)

class LoginViewModel(
    private val observeUsers: ObserveUsers
): ViewModel() {
    private val _state = MutableStateFlow(LoginUiState())
    val uiState = _state.asStateFlow()
    
    init {
        viewModelScope.launch {
            observeUsers().collectLatest { users ->
                _state.update {
                    it.copy(totalUsers = users.size)
                }
            }
        }
    }
    
    fun updateUsername(value: String) {
        _state.update { it.copy(username = value) }
    }
}
```

## Combine

This technique combines multiple streams of data into a single UI state output. It's very similar to the approach above since it exposes a UI state class. The only difference is that it combines multiple stateflows using `combine` function and then creates a UI state class. This solves one problem if we need to filter or observe individual fields. But creates another problem because having multiple state flows for each field can be quite complex for large screens.

Here's a pitfall that will bite you eventually: the `combine` function only supports a limited number of flows directly (5). While you can create custom combiners, combining 5-7 or more flows — which is quite normal for a complex screen — makes the code very complex and difficult to read and maintain. You could also create inner classes inside your state class for reducing the complexity. But still, it won't reduce the business logic complexity.

This approach works well when we have mapping or filtering logic or checks in place, including if we have multiple sources of input like observing users or favorite books from usecase or repository.

> **Note:** Use `SavedStateHandle` to retain data, like user IDs, during configuration changes like orientation shifts and, specifically, for process death. Also, StateFlow can handle process death if used with SavedStateHandle and when it comes to `mutableStateOf` or compose state, `rememberSaveable` can be used for both process death or configuration changes retention.
> 
> To avoid leaking the resources during the collection of upstream flow, we've passed viewModelScope and sharing strategy in stateIn. (`stateIn` is used for converting the cold flow returned from `combine()` to hot stateflow)

```kotlin
@Stable
data class LoginUiState(
	val username: String, 
	val name: String,
)

class LoginViewModel(
	private val observeUser: ObserveUser,
) : ViewModel() {
    private val _username = MutableStateFlow<String?>("")
    private val _name = MutableStateFlow<String?>("")

    val uiState = combine(
	    _username, 
	    _name,
	    observeUser(),
    ) { username, name, user ->
        LoginUiState(
	        username = username ?: "", 
	        name = name ?: user.name,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = LoginUiState.Loading
    )
}
```

> **🧠 Think about it:** You've seen three patterns now — Single Field, UI State Class, and Combine. Each one fixes a problem from the previous one but introduces a new one. What if the problem isn't which pattern you pick, but the reactive plumbing itself?

## The Compose Way

This approach works well only in compose-based UI. There are multiple ways we can use compose states in viewmodel or presenters which is much cleaner than traditional viewmodels or presenters. A viewmodel or presenter can have compose states only, or both compose states and coroutines flow.

One practical reason I've found for using compose state in viewmodel is that the compose text field API works well with direct compose state instead of any StateFlow. The major problem when it comes to compose text API is, it's difficult to sync the state between the viewmodel and UI in realtime without any delays if compose state is not used. There are many articles and talks discussing this problem. Here's an example:

```kotlin
@Composable
fun LoginScreen(viewModel: LoginViewModel) {
    TextField(
        value = viewModel.username,
        onValueChange = { viewModel.username = it },
    )
    
    TextField(
        value = viewModel.password,
        onValueChange = { viewModel.password = it },
    )
}

class LoginViewModel(
    private val repository: LoginRepository,
) : ViewModel() {
    var username by mutableStateOf("")
        private set
    var password by mutableStateOf("")
        private set
        
    val isUsernameValid by derivedStateOf {
        repository.isUsernameValid(username)
    }
        
    val isPasswordValid: StateFlow<Boolean> =
        snapshotFlow { password }
            .mapLatest { repository.isPasswordValid(it) }
            .stateIn(
                scope = viewModelScope,
                started = SharingStarted.WhileSubscribed(5_000),
                initialValue = false
            )
    
    fun login() {
        viewModelScope.launch {
            // login
        }
    }
}
```

Look at that code for a second. No `MutableStateFlow`, no backing field pattern with the underscore prefix dance. `mutableStateOf` holds state that Compose's snapshot system tracks automatically. `derivedStateOf` safely produces derived state that only recomputes when its dependencies change. And `snapshotFlow` bridges compose state into the Flow world, which is useful when you need to perform async operations like validation on a state change. When this is paired with `stateIn`, it can be converted to hot StateFlow.

But updating compose state from a background thread is risky. For guaranteed atomic updates and thread safety when using Compose State, use `Snapshot.withMutableSnapshot`. This creates an isolated mutable snapshot, applies your changes atomically, and then merges them back into the global snapshot. Without it, concurrent writes from different threads can race and produce inconsistent state. Think of it like a database transaction — either all your changes apply, or none of them do.

```kotlin
class LoginViewModel(
    private val defaultDispatcher: Dispatcher    
) : ViewModel() {
    var isLoggedIn by mutableStateOf(false)
        private set
        
    fun login() {
        viewModelScope.launch {
            withContext(defaultDispatcher) {
                Snapshot.withMutableSnapshot {
                    isLoggedIn = true
                }
            }
        }
    }
}
```

## The Real Benefits

The real benefits come when compose states are combined with the recomposition part, instead of just writing compose state fields in viewmodel. Business logic written in compose way is much cleaner than traditional viewmodel with coroutines. One example is retaining values during process-death — using compose state with `rememberSaveable` is much cleaner and simpler than using flows with `SavedStateHandle`. For example, if we write the presenter in traditional way:

```kotlin
class Presenter() {
    private val stateFlow = MutableStateFlow<State>()
    
    fun state(): StateFlow<State> {
        scope.launch {
            events.collectLatest { event ->
                stateFlow.update { it.copy(search = event.query) }
            }
        }
        return stateFlow
    }
}
```

This could be replaced with something much simpler, cleaner, and more readable if we write it in compose way :)

```kotlin
class Presenter() {
    @Composable
    fun state(): State {
        var query by remember { mutableStateOf("") }
        
        return State(search = query) { event ->
            query = event.query
        }
    }
}
```

Read both of those again. The presenter function went from managing a `MutableStateFlow`, launching coroutines, collecting events, and manually calling `update` with `copy` — to just declaring a state variable and returning it. The compose runtime handles the recomposition when `query` changes. No flow operators, no coroutine launching, no manual state mutation. That's a significant reduction in complexity.

It's like going from manually wiring every light switch in your house to a circuit breaker panel. Same lights, same electricity, but the wiring is dramatically simpler because the system manages the connections for you.

> **⚡ Quick check:** Can you explain why the Compose version doesn't need `scope.launch` or `collectLatest`? What's doing that work instead?

## Molecule

This is where things get really interesting. Molecule from Cash App takes the idea above and formalizes it — it lets you build a `StateFlow` or `Flow` stream using Compose's runtime, completely without any UI. Under the hood, it "just" glues Compose's state management to kotlinx.coroutines' flows so it can be used without the node tree.

The `launchMolecule` function launches a coroutine that continually recomposes the body to produce a `StateFlow` of values. And `moleculeFlow` does the same but produces a cold `Flow` instead. Here's what it looks like in a ViewModel:

```kotlin
class LoginViewModel : ViewModel() {
    private val usernameState = mutableStateOf("")
    private val nameState = mutableStateOf("")
    private val passwordState = MutableStateFlow("")
    
    val uiState: StateFlow<UiState> = 
        viewModelScope.launchMolecule(mode = ContextClock) {
            val username by usernameState
            val name by nameState
            val password by passwordState.collectAsState()
            
            UiState(
                username = username, 
                name = name, 
                password = password,
            )
        }
}
```

You can also use `remember`, `LaunchedEffect`, and all compose runtime APIs inside the molecule body. It supports two recomposition modes — `ContextClock` which ties recomposition to a frame clock (useful on Android's main thread with `AndroidUiDispatcher.Main`), and `Immediate` which recomposes as soon as state changes without waiting for a frame.

But where Molecule really shines is with standalone presenter functions. Cash App uses this pattern extensively — a `@Composable` function that takes flows as input, collects them with `collectAsState`, and returns a model object. No ViewModel ceremony, no `MutableStateFlow`, no `combine` with its 5-flow limit:

```kotlin
@Composable
fun ProfilePresenter(
    userFlow: Flow<User>,
    balanceFlow: Flow<Long>,
): ProfileModel {
    val user by userFlow.collectAsState(null)
    val balance by balanceFlow.collectAsState(0L)

    return if (user == null) {
        ProfileModel.Loading
    } else {
        ProfileModel.Data(user.name, balance)
    }
}

val models: StateFlow<ProfileModel> = 
    scope.launchMolecule(mode = ContextClock) {
        ProfilePresenter(db.users(), db.balances())
    }
```

The ceremony of combining reactive streams scales non-linearly — the more data sources you have, the harder the reactive code becomes. Remember the `combine` function and its 5-flow limit? With Molecule, you just collect each flow and write imperative Kotlin. Ten data sources? Twenty? Doesn't matter. You just add another `collectAsState` line and keep going. The compose runtime handles the reactivity for you.

## Circuit Architecture

Slack's Circuit takes this even further. It's a full architecture framework built entirely on the Compose runtime. The core idea is clean: a `Presenter` and a `Ui` can't directly access each other. They communicate only through state and events.

Imagine a restaurant where the kitchen and the dining room have a wall between them. Orders go through a window in one direction, plated food comes back through the window in the other direction. The chef never walks into the dining room, the waiter never walks into the kitchen. That's Circuit — forced separation through a well-defined interface.

```kotlin
@CircuitInject(CounterScreen::class, AppScope::class)
@Composable
fun CounterPresenter(): CounterState {
    var count by rememberSaveable { mutableStateOf(0) }

    return CounterState(count) { event ->
        when (event) {
            CounterEvent.Increment -> count++
            CounterEvent.Decrement -> count--
        }
    }
}
```

Both the presenter and the UI are `@Composable` functions, but the presenter doesn't emit any UI — it only produces state. Circuit automatically connects the right presenter to the right UI based on a `Screen` key. The presenters use Compose runtime for state management (not Compose UI), and the UIs consume state and emit events. This forced separation makes the business logic independently testable and the UI completely pluggable.

Circuit is used in production at Slack and is multiplatform — it works on Android, iOS, Desktop, and Web. It's heavily influenced by Cash App's Broadway architecture and represents where this whole Compose-beyond-UI movement is heading.

## Tradeoffs

The compose way definitely makes the code much cleaner. But there are some trade-offs worth being honest about.

> **🔥 Real talk:** Testing presenters or viewmodels written with Molecule requires understanding of Turbine or similar libraries to test flows properly. You use `moleculeFlow(mode = Immediate)` with Turbine's `.test {}` block, and it works well — but it's a different mental model than testing a plain ViewModel with `StateFlow`. The first time you set it up, expect to spend some time figuring out the dance.

The Compose compiler plugin must be applied to any module that uses `@Composable` functions, even if that module has nothing to do with UI. That's an extra build configuration step that can surprise teams. And debugging recomposition-based state logic requires understanding of Compose's snapshot system, which has its own learning curve.

But I would argue that the complexity you remove from the business logic layer more than compensates for these costs. A ViewModel that used to be 80 lines of `combine`, `stateIn`, `collectLatest`, and manual state mutation becomes 30 lines of straightforward Kotlin with compose state. Once you internalize the model, you don't go back.

To me, using the compose runtime like compose states in viewmodel or presenters itself doesn't seem a bad practice or anti-pattern or any bad architectural decision because clearly, fundamentally, compose runtime and UI have been separated from the bottom. Jake Wharton has written extensively about this separation in his post "A Jetpack Compose by any other name" — and he's been building projects on just the Compose compiler and runtime, without Compose UI, on JVM servers and even non-browser JS engines. If anything, it validates that using the runtime outside of UI is exactly how it was designed to be used.

Thanks for reading through all of this :), Happy Coding!
