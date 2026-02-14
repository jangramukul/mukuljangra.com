---
title: Molecule Deep Dive — Compose Runtime Without the UI
layout: post
categories: post
tags:
  - Android
  - Jetpack Compose
  - Architecture
---

A couple of years ago, I was working on a screen that had about 12 different input sources — user inputs, repository observations, feature flags, network results. My ViewModel's `combine` pipeline was a nested mess of `stateIn`, `SharingStarted.WhileSubscribed`, and custom combiners because Kotlin's `combine` only has type-safe overloads for up to 5 flows. More than half the ViewModel code was pipeline plumbing, not actual business logic. If you've hit this ceiling, you know the frustration. The reactive stream ceremony scales non-linearly with complexity.

That frustration is exactly what led the Cash App team to build Molecule. But here's the thing — Molecule isn't just a "better combine." It represents a fundamental insight about what Jetpack Compose actually is, and once you internalize that insight, it changes how you think about state management in Android apps entirely.

## The Insight That Changes Everything

Jake Wharton wrote a blog post in 2020 called "A Jetpack Compose by any other name" where he argued that Compose is being pigeonholed by its own name. His core argument: **"Compose is, at its core, a general-purpose tool for managing a tree of nodes of any type."** Those tree nodes could be UI widgets, but they could just as easily be view state objects, model objects, or simply a value tree of pure data.

This is the reframe moment. When most Android developers hear "Compose," they think UI toolkit. But Compose has two distinct layers: the **Compose compiler and runtime**, which handle state tracking and recomposition, and **Compose UI**, which renders things to a canvas. These layers are intentionally separated. The compiler and runtime don't know anything about Android UI. They don't know what a `Canvas` is, what a `View` is, or what a screen looks like. They just manage a tree of nodes and track state changes.

Molecule exploits this separation. It takes the Compose compiler and runtime — the state tracking, the recomposition system, the snapshot state, `remember`, `LaunchedEffect`, all of it — and uses them purely for state management. No UI nodes. No rendering. Just state production. As Molecule's own README puts it: Molecule "just" glues Compose's state management to `kotlinx.coroutines` flows so that it can be used without the node tree.

## How Molecule Actually Works

At its core, Molecule does one thing: it runs a `@Composable` function and converts its return value into a `StateFlow`. Every time the composable recomposes — because a state it reads changed — a new value is emitted to the flow.

The entry point is `launchMolecule`, which launches a coroutine that continually recomposes the body to produce a `StateFlow` stream:

```kotlin
val profileModels: StateFlow<ProfileModel> = scope.launchMolecule(mode = ContextClock) {
    ProfilePresenter(
        userFlow = db.users(),
        balanceFlow = db.balances(),
    )
}
```

The `ProfilePresenter` here is just a `@Composable` function that returns a value. It doesn't render anything. It collects flows using `collectAsState`, manages local state with `remember` and `mutableStateOf`, runs side effects with `LaunchedEffect`, and returns a model object. The Compose runtime handles the recomposition — when any input changes, the function re-runs and produces a new model.

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

Compare this with the traditional `Flow`-based approach for the same logic:

```kotlin
class ProfilePresenter(private val db: Db) {
    fun transform(): Flow<ProfileModel> {
        return combine(
            db.users().onStart { emit(null) },
            db.balances().onStart { emit(0L) },
        ) { user, balance ->
            if (user == null) {
                ProfileModel.Loading
            } else {
                ProfileModel.Data(user.name, balance)
            }
        }
    }
}
```

With two flows, the traditional approach looks manageable. But as Molecule's documentation notes, "the ceremony of combining reactive streams will scale non-linearly." Add 5-6 more sources and the `combine` nesting becomes unreadable. The Molecule version stays flat and imperative regardless of how many sources you add — you just add more `collectAsState` calls and use the values directly.

## The Presenter Pattern

The architecture that Molecule enables is the **Presenter pattern**: a `@Composable` function whose only job is to produce state. It should never render UI content. This is the same separation that Circuit (Slack's architecture framework) enforces — the presenter produces state, the UI consumes it, and they communicate through a shared model type.

In a real app, this looks like extracting all your state logic from the ViewModel into a composable presenter:

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

Notice what's missing: no `MutableStateFlow`, no `combine`, no `stateIn`, no `SharingStarted`. The business logic reads like imperative Kotlin. You declare state, you use it, you return it. The Compose runtime handles the reactive wiring underneath. In the Cash App codebase, this is the pattern they migrated to — from RxJava presenters, to coroutine-based presenters with `combine`, to Compose-powered presenters with Molecule.

## ContextClock vs Immediate

One thing that tripped me up early was the `RecompositionMode` parameter. Compose's recomposition system is tied to a frame clock — it waits for the next frame before recomposing. Molecule inherits this behavior, and gives you two options.

**`RecompositionMode.ContextClock`** behaves like Compose UI: it pulls the `MonotonicFrameClock` from the coroutine context and recomposes in sync with it. On Android, using `AndroidUiDispatcher.Main` gives you a frame clock synchronized with the device's display refresh rate. This means your state updates are batched per frame, which is exactly what you want for UI-bound state. If three different inputs change between two frames, you get one recomposition instead of three — reducing unnecessary state emissions.

**`RecompositionMode.Immediate`** constructs an immediate clock that produces a frame whenever the enclosing flow is ready to emit. Every state change triggers an immediate recomposition and emission. This is useful for testing, for running Molecule off the main thread, or for cases where you need every intermediate state. But for production UI state, `ContextClock` is usually the right choice because it naturally batches updates and avoids flooding your UI with rapid state changes.

The difference matters more than you'd think. I've seen cases where `Immediate` mode caused excessive recompositions in a presenter with multiple rapidly-changing inputs, leading to unnecessary UI work downstream. Switching to `ContextClock` with `AndroidUiDispatcher.Main` solved it because updates got coalesced per frame.

## Testing With Turbine

Testing is where Molecule's design pays off cleanly. You use `moleculeFlow` with `Immediate` mode and test using Turbine, Cash App's flow testing library. Your presenter runs like any other flow in Turbine:

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

The test runs the full recomposition cycle. When you emit an event through the event sink, the composable recomposes and produces a new state, which Turbine captures with `awaitItem()`. You're testing the actual state machine, not mocking interactions. This is closer to how the presenter runs in production compared to testing a ViewModel by calling methods and asserting on `StateFlow.value`.

## The Architecture: Presenter → Molecule → StateFlow → UI

The full architecture flow looks like this. Your `@Composable` presenter function collects flows, manages local state with `remember` and `mutableStateOf`, runs side effects with `LaunchedEffect`, and returns a model. Molecule runs this composable in a coroutine, recomposing it whenever state changes, and emitting new models to a `StateFlow`. Your UI layer collects this `StateFlow` and renders. The UI sends events back to the presenter through an event sink lambda included in the state.

This maps cleanly to the architecture that Cash App, Slack (with Circuit), and other large-scale Android teams have converged on. The key principle is that a composable function should either render UI or return state, but never both. Molecule handles the "return state" side, Compose UI handles the "render" side.

## The Honest Tradeoffs

I would be dishonest if I painted Molecule as a pure upgrade with no costs. There are real tradeoffs you need to consider.

**Compose dependency in non-UI code.** Your presenters, which are business logic, now depend on the Compose compiler plugin and runtime. This means every module that contains a presenter needs the Compose compiler applied. Some teams feel strongly that business logic should be free of framework dependencies. IMO, since the Compose runtime is a general-purpose state management tool and not a UI framework, this concern is more philosophical than practical — but it's a valid architectural stance.

**Learning curve.** Your team needs to understand Compose's recomposition model to write correct presenters. Things like `remember` semantics, `LaunchedEffect` keys, `derivedStateOf` behavior — all of these matter for correctness, not just performance. If your team is still getting comfortable with Compose for UI, adding it to the state layer increases the surface area they need to learn.

**Debugging.** When something goes wrong in a Molecule presenter, you're debugging recomposition behavior. Why did this composable recompose? Why didn't it? These questions require understanding Compose's snapshot system, which is a different mental model than debugging `combine` pipelines. Tools like Layout Inspector don't help here because there's no UI tree to inspect.

**Testing requires Turbine.** While Turbine is excellent, it's another library your team needs to learn. The `awaitItem()` model is different from simply asserting on `StateFlow.value`. If a state emission happens faster than expected, or if intermediate states are coalesced, tests can become flaky without careful use of `Immediate` mode and proper assertions.

Despite these tradeoffs, I think Molecule represents where Android state management is heading. The traditional ViewModel with `combine` and `stateIn` works — it's well-documented, universally understood, and fine for most apps. But once your screens get complex enough that more than half your ViewModel is pipeline plumbing, the Compose-powered presenter model genuinely simplifies things. The code becomes easier to read, easier to reason about, and the reactive wiring disappears into the runtime where it belongs.

The fundamental insight is worth repeating: Compose is a general-purpose state management tool. Molecule just makes that insight practical.

Thanks for reading!
