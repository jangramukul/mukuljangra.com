---
title: Molecule Deep Dive — Compose Runtime Without the UI
layout: post
categories: post
tags:
  - Android
  - Jetpack Compose
  - Architecture
---

A couple of years ago, I was working on a screen that had about 12 different input sources — user inputs, repository observations, feature flags, network results. My ViewModel's `combine` pipeline was a nested mess of `stateIn`, `SharingStarted.WhileSubscribed`, and custom combiners because Kotlin's `combine` only has type-safe overloads for up to 5 flows. Beyond that, you're stuck with the varargs overload where everything becomes `Array<T>` and you lose individual type information, or you nest combines inside combines. More than half the ViewModel code was pipeline plumbing, not actual business logic.

If you've hit this ceiling, you know the frustration. The reactive stream ceremony scales non-linearly with complexity. That frustration is exactly what led the Cash App team to build [Molecule](https://github.com/cashapp/molecule). But here's the thing — Molecule isn't just a "better combine." It represents a fundamental insight about what Jetpack Compose actually is, and once you internalize that insight, it changes how you think about state management entirely.

## What Molecule Actually Solves

The problem isn't just `combine`. It's the entire reactive pipeline model. In a traditional ViewModel, producing state from multiple sources means wiring up `MutableStateFlow` fields, piping them through `combine`, converting with `stateIn`, setting up `SharingStarted.WhileSubscribed(5_000)` for lifecycle safety, and managing `onStart` emissions so your flow has an initial value. Each additional input source adds another layer of ceremony. I've seen production ViewModels where the actual business logic — "if the user hasn't verified their email, show the banner" — was buried inside six levels of `combine` and `map` operators.

Compose UI has a related layering problem that Molecule also fixes. When you use `collectAsState()` in Compose UI to consume a `Flow`, you're forced to provide an initial value at the view layer. As Molecule's README points out, this is a layering violation — the view layer shouldn't be deciding what the default state is, because the presenter layer controls the model. Molecule eliminates this by producing a `StateFlow` with a synchronous initial value that the UI can read immediately.

## The Reframe: Compose Is Not a UI Toolkit

Jake Wharton wrote a blog post called "A Jetpack Compose by any other name" where he argued that Compose is being pigeonholed by its own name. His core argument: **"Compose is, at its core, a general-purpose tool for managing a tree of nodes of any type."** Those tree nodes could be UI widgets, but they could just as easily be state objects or pure data.

This is the moment that changed how I think about state management. Compose has two distinct layers: the **Compose compiler and runtime**, which handle state tracking, snapshot management, and recomposition, and **Compose UI**, which renders widgets to a canvas. The compiler and runtime don't know anything about Android UI. They don't know what a `Canvas` is, what a `View` is, or what a screen looks like. They just manage a tree of nodes and track state changes.

Molecule exploits this separation. It takes the Compose compiler and runtime — the state tracking, the recomposition system, `remember`, `LaunchedEffect`, `derivedStateOf`, all of it — and uses them purely for state management. No UI nodes, no rendering. Just state production. As the Molecule README puts it, it "just" glues Compose's state management to `kotlinx.coroutines` flows so that it can be used without the node tree.

## How Molecule Works Under the Hood

Molecule provides two entry points: `launchMolecule` and `moleculeFlow`. Both run a `@Composable` function and turn its return value into a flow. Every time the composable recomposes — because a state it reads changed — a new value is emitted.

`launchMolecule` is an extension on `CoroutineScope`. It launches a coroutine that continually recomposes the body and returns a `StateFlow`:

```kotlin
val models: StateFlow<ProfileModel> = scope.launchMolecule(mode = ContextClock) {
    ProfilePresenter(
        userFlow = db.users(),
        balanceFlow = db.balances(),
    )
}
```

`moleculeFlow` returns a cold `Flow` instead. It doesn't need a scope — each collector gets its own composition. This is particularly useful for testing, because each test gets an isolated composition that starts fresh:

```kotlin
val models: Flow<ProfileModel> = moleculeFlow(mode = Immediate) {
    ProfilePresenter(
        userFlow = db.users(),
        balanceFlow = db.balances(),
    )
}
```

The `ProfilePresenter` here is just a `@Composable` function that returns a value. It collects flows using `collectAsState`, manages local state with `remember` and `mutableStateOf`, runs side effects with `LaunchedEffect`, and returns a model object. The Compose runtime handles recomposition — when any input changes, the function re-runs and produces a new model.

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
```

Compare this with the traditional `Flow`-based approach:

```kotlin
class ProfilePresenter(private val db: Db) {
    fun transform(): Flow<ProfileModel> {
        return combine(
            db.users().onStart { emit(null) },
            db.balances().onStart { emit(0L) },
        ) { user, balance ->
            if (user == null) ProfileModel.Loading
            else ProfileModel.Data(user.name, balance)
        }
    }
}
```

With two flows, the traditional approach looks manageable. Add 5-6 more sources and the `combine` nesting becomes unreadable. The Molecule version stays flat and imperative regardless of how many sources you add — you just add more `collectAsState` calls and use the values directly in Kotlin control flow.

## The Presenter Pattern and Event Sinks

The architecture Molecule enables is the **Presenter pattern**: a `@Composable` function whose only job is to produce state. It should never render UI content. This is the same separation that Circuit (Slack's architecture framework) enforces — a composable function should either render UI or return state, but never both.

In a real app, this looks like extracting all your state logic into a composable presenter and hosting it inside a ViewModel with `launchMolecule`:

```kotlin
class PaymentViewModel(
    private val paymentRepository: PaymentRepository,
    private val userRepository: UserRepository,
) : ViewModel() {

    val uiState: StateFlow<PaymentUiState> = viewModelScope.launchMolecule(
        mode = RecompositionMode.ContextClock
    ) {
        PaymentPresenter(paymentRepository, userRepository)
    }
}

@Composable
fun PaymentPresenter(
    paymentRepository: PaymentRepository,
    userRepository: UserRepository,
): PaymentUiState {
    var amount by remember { mutableStateOf("") }
    var recipient by remember { mutableStateOf("") }
    val user by userRepository.currentUser().collectAsState(initial = null)
    val recentPayments by paymentRepository
        .recentPayments()
        .collectAsState(initial = emptyList())

    val isValid by remember {
        derivedStateOf {
            amount.toDoubleOrNull() != null && recipient.isNotBlank()
        }
    }

    LaunchedEffect(user) {
        user?.let { recipient = it.defaultRecipient ?: "" }
    }

    return PaymentUiState(
        amount = amount,
        recipient = recipient,
        recentPayments = recentPayments,
        isValid = isValid,
        balance = user?.balance ?: 0L,
    ) { event ->
        when (event) {
            is PaymentEvent.AmountChanged -> amount = event.value
            is PaymentEvent.RecipientChanged -> recipient = event.value
            is PaymentEvent.SubmitClicked -> { /* trigger payment */ }
        }
    }
}
```

Notice the event sink pattern — the last lambda in the `PaymentUiState` constructor. The UI sends events back to the presenter through this lambda, which is included directly in the state object. The presenter handles each event by mutating its local compose state, which triggers recomposition and produces a new state. This is exactly the unidirectional data flow pattern, but without any of the `MutableStateFlow`, `combine`, or `stateIn` plumbing. The business logic reads like imperative Kotlin.

This is the pattern Cash App migrated to — from RxJava presenters, to coroutine-based presenters with `combine`, to Compose-powered presenters with Molecule. At each step, the pipeline ceremony decreased and the readability of actual business logic increased.

## RecompositionMode: ContextClock vs Immediate

One thing that tripped me up early was the `RecompositionMode` parameter. Compose's recomposition system is tied to a frame clock — it waits for the next frame before recomposing. Molecule inherits this behavior and gives you two options.

**`RecompositionMode.ContextClock`** behaves like Compose UI: it pulls the `MonotonicFrameClock` from the coroutine context and recomposes in sync with it. On Android, using `AndroidUiDispatcher.Main` gives you a frame clock synchronized with the device's display refresh rate. If three different inputs change between two frames, you get one recomposition instead of three. This frame batching is exactly what you want for UI-bound state — it reduces unnecessary emissions and avoids flooding your UI with rapid state changes. If there's no `MonotonicFrameClock` in the coroutine context, `ContextClock` will throw an exception, so you need to make sure your scope provides one.

**`RecompositionMode.Immediate`** constructs an immediate clock that produces a frame whenever the enclosing flow is ready to emit. Every state change triggers an immediate recomposition and emission. This is useful for testing (where you want every intermediate state captured), for running Molecule off the main thread, or for cases where frame batching would hide state transitions you care about. But for production UI state, `ContextClock` is usually the right choice.

The difference matters more than you'd think. I've seen cases where `Immediate` mode caused excessive recompositions in a presenter with multiple rapidly-changing inputs, leading to unnecessary UI work downstream. Switching to `ContextClock` with `AndroidUiDispatcher.Main` solved it because updates got coalesced per frame. You can also provide your own `BroadcastFrameClock` if you need custom frame timing — useful for scenarios like background processing where you want to control exactly when recomposition happens.

## Testing With moleculeFlow and Turbine

Testing is where Molecule's design pays off cleanly. The recommended approach is `moleculeFlow(mode = Immediate)` tested with [Turbine](https://github.com/cashapp/turbine), Cash App's flow testing library. You use `Immediate` mode in tests because you want to capture every state transition — frame batching from `ContextClock` would coalesce intermediate states and make assertions unreliable.

`moleculeFlow` is the right entry point for testing instead of `launchMolecule` because it returns a cold `Flow`. Each test gets a fresh composition that starts and stops with the test. No shared `CoroutineScope`, no lingering state between tests.

```kotlin
@Test
fun `payment validation updates correctly`() = runTest {
    val paymentRepo = FakePaymentRepository()
    val userRepo = FakeUserRepository()

    moleculeFlow(RecompositionMode.Immediate) {
        PaymentPresenter(paymentRepo, userRepo)
    }.test {
        val initial = awaitItem()
        assertFalse(initial.isValid)
        assertEquals("", initial.amount)

        initial.eventSink(PaymentEvent.AmountChanged("50.00"))
        val withAmount = awaitItem()
        assertEquals("50.00", withAmount.amount)
        assertFalse(withAmount.isValid) // still no recipient

        withAmount.eventSink(PaymentEvent.RecipientChanged("alice"))
        val valid = awaitItem()
        assertTrue(valid.isValid)
    }
}
```

The test runs the full recomposition cycle. When you emit an event through the event sink, the composable recomposes and produces a new state, which Turbine captures with `awaitItem()`. You're testing the actual state machine — the same recomposition logic that runs in production — not mocking interactions or calling methods on a ViewModel. Each `awaitItem()` gives you the state after recomposition completes, so you're asserting on real state transitions.

One gotcha: if you're unit testing Molecule on the JVM in an Android module, you need `testOptions { unitTests.returnDefaultValues = true }` in your AGP config. Without this, Android framework classes referenced during composition will throw stubs.

## Molecule vs ViewModel: When To Use Each

This is the practical question most teams ask. I think the answer depends on where your friction actually is.

**Stick with ViewModel** if your app already has an established ViewModel architecture, your screens are small to medium complexity with 3-4 input sources, your team is comfortable with StateFlow patterns, and you're invested in Jetpack Navigation's ViewModel scoping. ViewModel is well-documented, universally understood, and works fine for the majority of Android apps. The `combine` ceiling and conversion overhead are real annoyances, but manageable.

**Consider Molecule** if complex screens are creating `combine` nightmares with 6+ input sources, you want your business logic to read like imperative Kotlin instead of reactive pipelines, or you're already comfortable with Compose's runtime concepts like `remember`, `LaunchedEffect`, and `derivedStateOf`. Molecule doesn't replace ViewModel — it lives inside one. Your ViewModel becomes a thin shell that hosts a `launchMolecule` call and exposes the resulting `StateFlow`. You keep ViewModel's lifecycle handling and Navigation integration while getting Molecule's cleaner state production.

For migration, I'd suggest starting with your most complex screen — the one where the `combine` pipeline is already painful. Extract the state logic into a `@Composable` presenter function, host it with `launchMolecule` inside the existing ViewModel, and see how it feels. You don't need to migrate everything at once. Molecule and traditional StateFlow patterns can coexist in the same codebase because the ViewModel still exposes `StateFlow` to the UI layer regardless of how the state was produced.

## The Honest Tradeoffs

I would be dishonest if I painted Molecule as a pure upgrade with no costs.

**Compose dependency in non-UI code.** Your presenters now depend on the Compose compiler plugin and runtime. Every module containing a presenter needs the Compose compiler applied. Some teams feel strongly that business logic should be free of framework dependencies. IMO, since the Compose runtime is a general-purpose state management tool and not a UI framework, this concern is more philosophical than practical — but it's a valid architectural stance.

**Learning curve.** Your team needs to understand Compose's recomposition model to write correct presenters. Things like `remember` semantics, `LaunchedEffect` keys, `derivedStateOf` behavior — these matter for correctness, not just performance. If your team is still getting comfortable with Compose for UI, adding it to the state layer increases the surface area they need to learn.

**Debugging recomposition.** When something goes wrong in a Molecule presenter, you're debugging recomposition behavior — why did this composable recompose? Why didn't it? These questions require understanding Compose's snapshot system, which is a different mental model than debugging `combine` pipelines. Tools like Layout Inspector don't help here because there's no UI tree to inspect.

**Testing requires Turbine.** While Turbine is excellent, it's another library and mental model. The `awaitItem()` pattern is different from simply asserting on `StateFlow.value`. If intermediate states get coalesced or an emission happens faster than expected, tests can become flaky without careful use of `Immediate` mode.

Despite these costs, I think Molecule represents where Android state management is heading. The traditional ViewModel with `combine` and `stateIn` works fine for most apps. But once your screens get complex enough that more than half your ViewModel is pipeline plumbing, the Compose-powered presenter model genuinely simplifies things. The reactive wiring disappears into the runtime where it belongs, and your business logic reads like the straightforward Kotlin it should have been all along.

The fundamental insight is worth repeating: Compose is a general-purpose state management tool. Molecule just makes that insight practical.

Thanks for reading!
