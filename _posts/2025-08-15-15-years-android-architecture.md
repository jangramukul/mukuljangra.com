---
title: 15 Years of Android Architecture — From MVC to Compose Presenters
layout: post
categories: post
tags:
  - Android
  - Architecture
---

I started writing Android code in 2017, somewhere in the middle of this story. My first project used Activities for everything — business logic in `onClick` listeners, network calls in `AsyncTask`, and state stored in member variables that vanished on rotation. I didn't know there was a better way because, at that point, the community was still figuring it out. Google hadn't published official architecture guidance yet, and the patterns we used came from individual engineers and companies experimenting in the open.

Looking back over 15 years of Android architecture, what strikes me is how each era solved real problems from the previous one — and introduced new problems that the next era would tackle. It's not a story of progress toward perfection. It's a story of tradeoffs shifting as our understanding deepened, our tools improved, and the platform evolved. Every pattern that fell out of favor was genuinely good for its time. And every pattern we use today carries complexity that some future pattern will try to eliminate.

## 2008-2012 — The Wild West

Android launched in 2008 with Activity as the primary building block. There was no architecture guidance from Google. Activity was your controller, your view, and often your model. You fetched data in `onCreate`, parsed JSON with bare `try/catch` blocks, stored results in member variables, and updated Views directly. If you needed background work, you used raw `Thread` or, later, `AsyncTask`.

The problems were immediate and obvious. `AsyncTask` held implicit references to the Activity, causing memory leaks and crashes when the Activity was destroyed before the task completed. Configuration changes (rotation, language switch) destroyed and recreated the Activity, wiping out all member variable state. There was no lifecycle management — developers had to manually track whether the Activity was still alive before updating UI. And testing was essentially impossible because all logic lived inside Android framework classes that couldn't run on the JVM.

But here's the thing — it worked for the apps of that era. Android apps in 2008-2012 were simple by today's standards. A few screens, basic CRUD operations, minimal state management. The architecture didn't need to scale because the apps didn't need to scale. The problems only became painful as apps grew more complex, screens held more state, and user expectations rose.

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

## 2013-2015 — MVP and the Square Influence

The MVP (Model-View-Presenter) pattern arrived in the Android world largely through Square's engineering team. Square was building complex financial apps — payment flows, multi-step forms, real-time data — and the Activity-does-everything approach was clearly failing them. They open-sourced libraries like Mortar and Flow, which introduced the idea of Presenters as lifecycle-independent components that survived configuration changes.

The core insight of MVP was separation: the View (Activity/Fragment) handles display, the Presenter handles logic, and the Model handles data. The Presenter doesn't know about Android framework classes — it works through a View interface. This meant, for the first time, you could unit test your business logic on the JVM without Robolectric or an emulator.

Dagger (also from Square) made dependency injection practical on Android, which was essential for MVP. Without DI, creating Presenters with their repository dependencies required massive constructor chains or service locators. Dagger's compile-time code generation made injection fast enough for mobile and eliminated the boilerplate.

The MVP era also brought the first serious conversations about "clean architecture" on Android — separating your code into layers (data, domain, presentation) with clear boundaries. Fernando Cejas' blog series on Clean Architecture became required reading. Uncle Bob's architecture principles, adapted for mobile, started influencing how teams structured their packages and modules.

The main problem with MVP was boilerplate. Every screen needed a View interface, a Presenter class, a contract defining their interaction, and DI wiring to connect them. For a simple screen, this was 4-5 files before you wrote any actual logic. The Presenter also had lifecycle issues — you needed to manually call `onAttach` and `onDetach` to prevent the Presenter from updating a destroyed View. Many teams got this wrong, leading to the same crashes MVP was supposed to prevent.

## 2016-2018 — Google Steps In With Architecture Components

In 2017, Google did something unprecedented for Android: they published official architecture guidance. Architecture Components introduced `ViewModel`, `LiveData`, `Room`, and `Lifecycle` — a cohesive set of libraries that pushed the community toward MVVM (Model-View-ViewModel). This was the first time Google said "here's how you should structure your app" rather than leaving it entirely to the community.

`ViewModel` solved the lifecycle problem that had plagued every previous pattern. It survived configuration changes automatically because it was scoped to a `ViewModelStoreOwner` and retained across Activity/Fragment recreation. You didn't need to manually manage attach/detach — the framework handled it. `LiveData` was a lifecycle-aware observable that automatically stopped emitting when the UI was in the background, preventing the "updating a destroyed View" crash that haunted MVP.

The shift from MVP to MVVM was also a shift in data flow philosophy. MVP was imperative — the Presenter called methods on the View interface to update UI. MVVM was reactive — the ViewModel exposed observable streams (LiveData), and the View subscribed to them. This made the data flow unidirectional and easier to reason about, especially as screens grew complex.

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

The MVVM era also brought Kotlin to Android (officially supported from 2017) and, with it, extension functions, data classes, sealed classes, and coroutines. Kotlin didn't just change syntax — it changed how people thought about architecture. Sealed classes made state representation type-safe. Data classes eliminated value-type boilerplate. Extension functions made the framework API more ergonomic.

## 2018-2020 — MVI and the Single State Object

MVI (Model-View-Intent) gained traction as a response to a real problem with MVVM: state inconsistency. When your ViewModel exposes 5-6 separate LiveData fields, it's possible for them to get out of sync. One field shows "loading" while another shows "data available." The View has to reconcile these independently updating streams into a coherent screen, which is error-prone and hard to test.

MVI collapsed all state into a single object. Inspired by Redux and the Elm Architecture from the web world, MVI introduced a unidirectional flow: the View sends Intents (user actions), the ViewModel processes them through a Reducer, and produces a single State object that the View renders. Because there's only one state object, it's impossible for fields to be out of sync.

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
                    _state.update { it.copy(orders = it.orders.filter { o -> o.id != intent.orderId }) }
                }
            }
        }
    }
}
```

The tradeoff was boilerplate and complexity. Every user action needed an Intent class. State updates went through a reducer or `copy()` chain. For simple screens, this was overkill — wrapping a button click in `sealed interface OrderIntent` and routing it through `processIntent()` added ceremony without value. For complex screens with lots of interdependent state, MVI was genuinely better than multiple LiveData fields. The community split: some teams went all-in on MVI, others used it selectively for complex screens and MVVM for simple ones.

## 2020-2022 — Coroutines Replace RxJava, StateFlow Replaces LiveData

This era wasn't a new architectural pattern — it was a tool replacement that subtly changed how existing patterns felt. Kotlin Coroutines, which had been stable since 2018, reached critical mass. RxJava's `Observable`, `Single`, `Completable`, and `Flowable` were replaced by `suspend` functions and `Flow`. The `combine`, `map`, `flatMapLatest` operators that people loved from RxJava had equivalents in Flow, but with simpler subscription management and no `Disposable` cleanup.

StateFlow replaced LiveData for state exposure. Unlike LiveData, StateFlow was a pure Kotlin construct — no Android dependency, testable on the JVM without any special rules, and compatible with coroutine operators out of the box. `viewModelScope.launch` replaced manual coroutine scope management. `stateIn` and `shareIn` made it easy to convert cold Flows to hot state holders.

The shift from RxJava to Coroutines reduced our ViewModel code by about 30-40% on average. The biggest win was readability — a chain of `flatMap`, `switchMap`, `observeOn`, `subscribeOn` calls in RxJava became a simple `withContext(Dispatchers.IO)` block with sequential code. Business logic that was hidden inside operator chains became visible as straightforward Kotlin. IMO, this was one of the most impactful shifts in the 15 years — not because it changed the architecture pattern, but because it made existing patterns dramatically more readable.

The `combine` ceiling became the new pain point, though. Complex screens with 6-7+ input flows hit the type-safe `combine` overload limit (5 parameters), forcing developers into varargs `combine` with `Array<Any>` or nested combines. This is a real friction that the next era would address.

## 2022-2024 — Compose Changes the Rules

Jetpack Compose didn't just replace XML — it changed what "separation of concerns" means. In the XML world, the View was defined in XML layout files and the logic lived in Activities/Fragments/ViewModels. This separation was physical — different files, different languages (XML vs Kotlin). With Compose, both UI and logic are Kotlin. The separation shifts from "different files" to "different responsibilities within composable functions."

This has a profound impact on architecture. The ViewModel's job in the XML world was partly to survive configuration changes and partly to be the bridge between reactive data and imperative View updates. In Compose, the bridge is unnecessary — composable functions naturally re-render when state changes. What remains is lifecycle scoping and state survival across configuration changes, which `ViewModel` still provides but feels increasingly like ceremony for simpler screens where `rememberSaveable` would suffice.

Compose also introduced its own state primitives — `mutableStateOf`, `derivedStateOf`, `snapshotFlow` — that work differently from Flow and StateFlow. They're synchronous, they integrate with the recomposition system directly, and they don't need collection ceremony. This created a tension: should state live in `StateFlow` inside a `ViewModel`, or in `mutableStateOf` inside a composable? The answer depends on whether the state needs to survive process death, whether it's shared across composables, and how complex the state management is.

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

No `combine`. No `stateIn`. No `MutableStateFlow`. No `viewModelScope.launch`. State is just variables that trigger recomposition when they change. The `present()` function reads like sequential Kotlin — assign variables, react to events, return state. The Compose runtime handles the reactivity.

This is the reframe moment for me. **Every few years, the Android community discovers that the previous pattern's complexity was an artifact of its tools, not inherent to the problem.** AsyncTask's complexity came from callback threading. RxJava's complexity came from operator chains. LiveData's limitations came from its Android dependency. StateFlow's combine ceiling comes from its stream-based model. And now, Compose presenters show that reactive state management can be as simple as assigning variables — if your runtime supports it.

## What's Actually Getting Better

Across 15 years and 6-7 distinct eras, three things have consistently improved.

**Testability** has gone from nearly impossible (Activity logic with AsyncTask) to genuinely easy (pure Kotlin presenters that return state). Each era made testing more accessible — MVP made it possible, MVVM with ViewModel made it convenient, and Compose presenters make it almost trivial because you're just testing a function that returns a value.

**Separation of concerns** has gotten cleaner, but the boundaries have shifted. In MVP, the separation was View vs Presenter. In MVVM, it was UI vs ViewModel vs Repository. In Compose with Circuit, it's UI rendering vs state production. The concerns being separated are the same — display logic vs business logic vs data access — but the mechanisms have gotten lighter and more natural.

**Declarative state management** is the biggest win. We went from imperative "set this text, show this spinner, hide this button" to reactive "here's the current state, render it." This shift, which started with LiveData and culminated in Compose, eliminated entire categories of bugs around state inconsistency and forgotten UI updates.

But I want to be honest — some things haven't gotten simpler. The learning curve for new Android developers is steeper than ever. In 2010, you could build an app knowing just Activities and XML. In 2025, you need to understand Compose, ViewModel, StateFlow, coroutines, dependency injection, modularization, and potentially Molecule or Circuit. The power has increased, but so has the prerequisite knowledge. Each abstraction layer we added solved real problems, but it also added to the stack a newcomer needs to learn.

The pattern will continue. Whatever we're using in 2028 will make today's Compose presenters look like they had unnecessary complexity. And it'll probably be right — just as we were right that MVVM was better than MVP, and MVP was better than Activities doing everything. The trick is not to get attached to any particular era's tools, but to understand the underlying principles — separation, testability, unidirectional data flow — that persist across all of them.

Thank You!
