---
title: 15 Years of Android Architecture — From MVC to Compose Presenters
layout: post
categories: post
tags:
  - Android
  - Architecture
---

I started writing Android code in 2017, somewhere in the middle of this story. My first project used Activities for everything — business logic in `onClick` listeners, network calls in `AsyncTask`, and state stored in member variables that vanished on rotation. I didn't know there was a better way because, at that point, the community was still figuring it out. Google hadn't published official architecture guidance yet, and the patterns we used came from individual engineers and companies experimenting in the open.

Here's a useful way to think about it. Imagine you're renovating a house, one room at a time, while people are still living in it. You fix the kitchen, but then realize the plumbing you ran through the wall conflicts with the bathroom remodel you planned next. So you tear part of it out and reroute. That's Android architecture over the last 15 years — each era solved real problems from the previous one and introduced new ones for the next era to tackle. It's not progress toward perfection. It's tradeoffs shifting as our understanding deepened, our tools improved, and the platform evolved.

## 2008-2012 — The Wild West

Android launched in 2008 with Activity as the primary building block. There was no architecture guidance from Google — Activity was your controller, your view, and often your model. Think of it like a one-room apartment where your kitchen, bedroom, and office all share the same space. You fetched data in `onCreate`, parsed JSON with bare `try/catch` blocks, stored results in member variables, and updated Views directly. If you needed background work, you used raw `Thread` or, later, `AsyncTask`.

The problems showed up fast. `AsyncTask` held implicit references to the Activity, causing memory leaks and crashes when the Activity was destroyed before the task completed. Configuration changes destroyed and recreated the Activity, wiping out all in-memory state. There was no lifecycle management, so developers had to manually track whether the Activity was still alive before touching UI. And testing? Essentially impossible, because all logic lived inside framework classes that couldn't run on the JVM.

But here's the thing — it worked for the apps of that era. Apps in 2008-2012 were simple by today's standards. A few screens, basic CRUD, minimal state. The architecture didn't need to scale because the apps didn't. The problems only became painful as apps grew complex and user expectations for responsiveness rose.

```kotlin
// The 2010 way — everything in the Activity
class OrderActivity : Activity() {
    private var orders: List<Order>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_orders)

        // Network call on the main thread (pre-StrictMode)
        val task = object : AsyncTask<Void, Void, List<Order>>() {
            override fun doInBackground(vararg params: Void?): List<Order> {
                return ApiClient.fetchOrders() // raw HTTP, manual JSON parsing
            }
            override fun onPostExecute(result: List<Order>) {
                orders = result // lost on rotation
                updateList(result) // crash if Activity is destroyed
            }
        }
        task.execute()
    }
}
```

Look at that code. Rotate the phone and `orders` is gone. The AsyncTask finishes after the Activity is destroyed and you get a crash. We shipped apps like this. We all did.

## 2013-2015 — MVP and the Square Influence

The MVP (Model-View-Presenter) pattern arrived in the Android world largely through Square's engineering team. Square was building complex financial apps — payment flows, multi-step forms, real-time data — and the Activity-does-everything approach was clearly failing them. They open-sourced libraries like Mortar and Flow, which introduced the idea of Presenters as lifecycle-independent components that survived configuration changes.

The core insight of MVP was **separation**: the View handles display, the Presenter handles logic, the Model handles data. Think of it like a restaurant. The waiter (View) takes your order and brings your food, but never actually cooks. The chef (Presenter) does the work, but never talks to customers. The pantry (Model) provides ingredients but doesn't decide what to make. The Presenter works through a View interface and doesn't know about Android framework classes. This meant, for the first time on Android, you could unit test business logic on the JVM without Robolectric or an emulator.

That's a huge deal. Before MVP, testing your app logic meant booting up an emulator or faking out the entire Android framework. Now you could just test a plain Kotlin class.

Dagger (also from Square) made dependency injection practical on Android. Without DI, creating Presenters with their dependencies required massive constructor chains or service locators. Dagger's compile-time code generation made injection fast enough for mobile. This era also brought the first serious conversations about "clean architecture" on Android — separating code into data, domain, and presentation layers with clear boundaries.

The main problem with MVP was boilerplate. Every screen needed a View interface, a Presenter class, a contract, and DI wiring — 4-5 files before you wrote any logic. The Presenter also had lifecycle issues — you needed to manually call `onAttach` and `onDetach` to prevent updating a destroyed View. Many teams got this wrong, leading to the same crashes MVP was supposed to prevent.

Yeah, the irony. The pattern designed to stop lifecycle crashes still crashed if you forgot to wire up lifecycle callbacks.

## 2016-2018 — Google Steps In With Architecture Components

In 2017, Google did something unprecedented for Android: they published official architecture guidance. Architecture Components introduced `ViewModel`, `LiveData`, `Room`, and `Lifecycle` — a cohesive set of libraries that pushed the community toward MVVM (Model-View-ViewModel). This was the first time Google said "here's how you should structure your app" rather than leaving it entirely to the community.

`ViewModel` solved the lifecycle problem that plagued every previous pattern. It survived configuration changes automatically because it was scoped to a `ViewModelStoreOwner` and retained across Activity/Fragment recreation — no manual attach/detach needed. `LiveData` was lifecycle-aware and automatically stopped emitting when the UI was in the background, preventing the "updating a destroyed View" crash. `Room` gave us type-safe SQL with compile-time query verification, and `Lifecycle` let any component observe Activity/Fragment state transitions without coupling directly to them.

> **💡 The "aha" moment:** The shift from MVP to MVVM wasn't just a naming change — it was a shift in data flow philosophy. MVP was imperative: the Presenter called methods on the View interface to push updates. MVVM was reactive: the ViewModel exposed observable streams, and the View subscribed to them. It's the difference between someone handing you letters one by one (imperative) versus subscribing to a mailbox that just shows up with new mail whenever it arrives (reactive). Unidirectional, easier to reason about, especially as screens grew complex with multiple data sources.

```kotlin
class OrderViewModel(
    private val orderRepository: OrderRepository,
) : ViewModel() {

    private val _orders = MutableLiveData<List<Order>>()
    val orders: LiveData<List<Order>> = _orders

    private val _isLoading = MutableLiveData<Boolean>()
    val isLoading: LiveData<Boolean> = _isLoading

    fun loadOrders() {
        _isLoading.value = true
        viewModelScope.launch {
            val result = orderRepository.getOrders()
            _orders.value = result
            _isLoading.value = false
        }
    }
}
```

Notice how much cleaner this reads compared to the AsyncTask version? No worrying about whether the Activity is alive. No manual lifecycle tracking. The ViewModel just holds state, and the UI observes it. If the Activity gets destroyed and recreated during rotation, the ViewModel is still sitting there with its data intact.

This era also brought Kotlin to Android (officially supported from 2017) and with it, sealed classes, data classes, and coroutines. Kotlin didn't just change syntax — sealed classes made state representation type-safe, data classes eliminated value-type boilerplate, and these features made MVVM patterns significantly more expressive than they would have been in Java alone.

## 2018-2020 — MVI and the Single State Object

MVI (Model-View-Intent) gained traction as a response to a real problem with MVVM: state inconsistency. Imagine you're looking at a dashboard with 5-6 separate LiveData fields exposed by the ViewModel. What happens when one field says "loading" while another already says "here's your data"? They're out of sync. The View has to reconcile these independently updating streams into a coherent screen, which is error-prone and hard to test.

Can you guess how the community solved this?

They collapsed all state into a single object. Inspired by Redux and the Elm Architecture from the web world, MVI introduced a unidirectional flow: the View sends Intents (user actions), the ViewModel processes them through a Reducer function, and produces a single State object that the View renders. Because there's only one state object, fields can't get out of sync — the entire screen state is always consistent. It's like a snapshot camera instead of five separate video feeds. One click, one picture, everything in frame.

```kotlin
data class OrderState(
    val orders: List<Order> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

sealed interface OrderIntent {
    data object LoadOrders : OrderIntent
    data class DeleteOrder(val orderId: String) : OrderIntent
}

class OrderViewModel(
    private val orderRepository: OrderRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(OrderState())
    val state: StateFlow<OrderState> = _state.asStateFlow()

    fun processIntent(intent: OrderIntent) {
        when (intent) {
            is OrderIntent.LoadOrders -> {
                _state.update { it.copy(isLoading = true) }
                viewModelScope.launch {
                    val orders = orderRepository.getOrders()
                    _state.update { it.copy(orders = orders, isLoading = false) }
                }
            }
            is OrderIntent.DeleteOrder -> {
                viewModelScope.launch {
                    orderRepository.deleteOrder(intent.orderId)
                    _state.update {
                        it.copy(orders = it.orders.filter { o -> o.id != intent.orderId })
                    }
                }
            }
        }
    }
}
```

The tradeoff was boilerplate and complexity. Every user action needed an Intent class. State updates went through a reducer or `copy()` chain. For simple screens, wrapping a button click in `sealed interface OrderIntent` and routing it through `processIntent()` added ceremony without value. For complex screens with lots of interdependent state, MVI was genuinely better. The community split — some teams went all-in on MVI, others used it selectively for complex screens and kept MVVM for simpler ones. I think that selective approach was the right call.

## 2020-2022 — Coroutines Replace RxJava, StateFlow Replaces LiveData

This era wasn't a new architectural pattern — it was a tool replacement that subtly changed how existing patterns felt. Kotlin Coroutines, stable since 2018, reached critical mass. RxJava's `Observable`, `Single`, `Completable`, and `Flowable` were replaced by `suspend` functions and `Flow`. The operators people loved — `combine`, `map`, `flatMapLatest` — had equivalents in Flow, but with simpler subscription management and no `Disposable` cleanup.

StateFlow replaced LiveData for state exposure. Unlike LiveData, StateFlow was pure Kotlin — no Android dependency, testable on the JVM without special rules, compatible with coroutine operators out of the box. `stateIn` and `shareIn` made it easy to convert cold Flows to hot state holders with lifecycle-aware sharing strategies.

The shift from RxJava to Coroutines reduced our ViewModel code by roughly 30-40% on average. The biggest win was readability — a chain of `flatMap`, `switchMap`, `observeOn`, `subscribeOn` in RxJava became a simple `withContext(Dispatchers.IO)` block with sequential code. Business logic that was hidden inside operator chains became visible as straightforward Kotlin. IMO, this was one of the most impactful shifts in the 15 years — not because it changed the architecture pattern, but because it made existing patterns dramatically more readable and approachable.

> **🔥 Real talk:** The `combine` ceiling became the new pain point. Complex screens with 6-7+ input flows hit the type-safe `combine` overload limit — only 5 parameters before you fall back to `Array<Any>` and lose type safety. I've seen production ViewModels where more than half the code was pipeline plumbing — `stateIn` conversions, nested combines, `SharingStarted` configuration. The tools were better, but the complexity had shifted rather than disappeared.

Sound familiar? Every era solves one set of problems and hands you a new set. Keep that pattern in mind.

## 2022-2024 — Compose Changes the Rules

Jetpack Compose didn't just replace XML — it changed what "separation of concerns" means. In the XML world, the View was defined in XML layout files and the logic lived in Activities/Fragments/ViewModels. This separation was physical — different files, different languages (XML vs Kotlin). With Compose, both UI and logic are Kotlin. The separation shifts from "different file types" to "different responsibilities within composable functions."

Here's an analogy. In the old world, the blueprint for a building (XML) and the construction crew (Kotlin) were completely separate things. With Compose, the blueprint and the crew are the same team speaking the same language. You don't hand off a paper plan to someone else — you describe the building and it builds itself.

This has a real impact on architecture. ViewModel's job in the XML world was partly to survive configuration changes and partly to bridge reactive data to imperative View updates. In Compose, the bridge is unnecessary — composable functions naturally re-render when state changes. What remains is lifecycle scoping and state survival, which ViewModel still provides but feels like ceremony for simpler screens where `rememberSaveable` would suffice.

Compose also introduced its own state primitives — `mutableStateOf`, `derivedStateOf`, `snapshotFlow` — that integrate with the recomposition system directly and don't need collection ceremony. This created a genuine tension: should state live in `StateFlow` inside a ViewModel, or in `mutableStateOf`? The `TextField` API, for example, works noticeably better with direct Compose state because there's no flow collection latency. The answer depends on whether the state needs to survive process death, whether it's shared across composables, and how complex the management is.

## 2024-2025 — Compose Runtime for Business Logic

The latest evolution takes Compose's runtime beyond UI. Libraries like Molecule (from Cash App) and Circuit (from Slack) use the Compose runtime — `@Composable` functions, `remember`, `LaunchedEffect`, snapshot state — to write business logic. Instead of a ViewModel with StateFlow pipelines, you write a `@Composable present()` function that returns state directly.

```kotlin
class OrderPresenter @AssistedInject constructor(
    private val orderRepository: OrderRepository,
    @Assisted private val navigator: Navigator,
) : Presenter<OrderState> {

    @Composable
    override fun present(): OrderState {
        var orders by remember { mutableStateOf<List<Order>>(emptyList()) }
        var isLoading by remember { mutableStateOf(false) }

        LaunchedEffect(Unit) {
            isLoading = true
            orders = orderRepository.getOrders()
            isLoading = false
        }

        return OrderState(
            orders = orders,
            isLoading = isLoading,
            eventSink = { event ->
                when (event) {
                    is OrderEvent.Delete -> {
                        orders = orders.filter { it.id != event.orderId }
                    }
                }
            }
        )
    }
}
```

No `combine`. No `stateIn`. No `MutableStateFlow`. No `viewModelScope.launch`. State is just variables that trigger recomposition when they change. The `present()` function reads like sequential Kotlin — assign variables, react to events, return state. The Compose runtime handles the reactivity underneath.

Wait. Read that again.

State management — the thing we've been building increasingly complex machinery for across five eras — is now just... assigning variables? That's the same thing we did back in 2010 with Activity member variables, except now the runtime is smart enough to make it reactive without any of the lifecycle landmines.

> **🧠 Think about it:** Every few years, the Android community discovers that the previous pattern's complexity was an artifact of its tools, not inherent to the problem. AsyncTask's complexity came from callback threading. RxJava's came from operator chains. LiveData's limitations came from its Android dependency. StateFlow's combine ceiling comes from its stream-based model. So what complexity in today's Compose presenters will the *next* era reveal as unnecessary?

The tradeoff is real, though. Testing Compose presenters requires understanding of Molecule's test harness or Turbine, which has its own learning curve. To me, using the Compose runtime in presenters doesn't seem like a bad practice because fundamentally, compose runtime and UI have been clearly separated from the bottom — Jake Wharton has written extensively about this. But it does mean your team needs to understand Compose's execution model (recomposition, snapshot system, effect handlers) for business logic, not just for UI.

## What's Actually Getting Better

Across 15 years and seven distinct eras, three things have consistently improved.

**Testability** has gone from nearly impossible (Activity logic with AsyncTask) to genuinely easy (pure Kotlin presenters that return state). MVP made it possible by extracting logic behind an interface, MVVM made it convenient with JVM-friendly observables, and Compose presenters make it almost trivial because you're testing a function that returns a value. Think of it like cooking — we went from "you can only taste the dish after it's served to the customer" to "you can taste it anytime during prep."

**Separation of concerns** has gotten cleaner, but the boundaries keep shifting. In MVP it was View vs Presenter, in MVVM it was UI vs ViewModel vs Repository, in Compose with Circuit it's UI rendering vs state production. The concerns being separated are the same — display logic vs business logic vs data access — but the mechanisms have gotten lighter.

**Declarative state management** is the biggest win. We went from imperative "set this text, show this spinner, hide this button" to reactive "here's the current state, render it." This shift eliminated entire categories of bugs around state inconsistency and forgotten UI updates.

> **⚡ Quick check:** Can you trace the testability story through all the eras? Activity (untestable) to MVP (testable via interface) to MVVM (testable on JVM) to Compose presenters (test a function that returns a value). If you can explain *why* each step was easier, you've really internalized this journey.

## Choosing Your Architecture Today

I want to be honest about the tradeoffs that remain. The learning curve for new Android developers is steeper than ever. In 2010, you could build an app knowing just Activities and XML. In 2025, you need Compose, ViewModel, StateFlow, coroutines, DI, and potentially Molecule or Circuit. Each abstraction we added solved real problems, but also added to the stack a newcomer needs to learn.

For a team starting a new project today, I think the pragmatic advice is this: **MVVM with ViewModel and StateFlow** is still the safest default — it has the most documentation, tooling, and community knowledge. Use MVI selectively for screens with complex interdependent state. Look into Circuit or Molecule when your team is comfortable with Compose's runtime model and you're hitting real friction with `combine` pipelines or ViewModel scoping. Don't adopt Compose presenters because they're new — adopt them because you've felt the specific pain they solve.

The pattern will continue. Whatever we use in 2028 will make today's Compose presenters look like they had unnecessary complexity — just like every era before. The trick isn't to chase every new pattern, but to understand the principles — separation, testability, unidirectional data flow — that persist across all of them. Those principles are the constants. The tools are the variables.

Thank You!
