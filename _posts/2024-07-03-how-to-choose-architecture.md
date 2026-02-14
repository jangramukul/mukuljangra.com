---
title: How to Choose the Right Architecture?
layout: post
categories: post
tags:
  - Architecture
  - Android
---

I've worked on projects that used MVC, MVP, MVVM, and MVI. Every time we picked an architecture, someone on the team was convinced it was the wrong choice. And you know what? Looking back, the architecture itself was rarely the problem. The real issue was always a mismatch — picking something too complex for a simple project, or too simple for a complex one.

Think of it like choosing a vehicle. You don't drive a semi-truck to the grocery store. You don't take a bicycle on a cross-country road trip. Both are perfectly good vehicles — in the right context. Architecture is the same deal. The right choice depends on your project's complexity, your team's experience, and the specific problems you're trying to solve — not on which pattern is trending on Medium this month.

I'm going to walk through the major Android architectures, when each one fits, when it falls apart, and give you a practical framework for making the decision yourself.

## MVC — Model-View-Controller

MVC was the original Android pattern, whether developers called it that or not. The Activity or Fragment acted as both the View and the Controller — it received user input AND managed the UI. The Model was whatever data classes and database helpers you had.

Here's the thing about MVC in Android — the Controller (your Activity/Fragment) is tightly coupled to the Android lifecycle. You can't unit test the controller without an emulator or Robolectric. Business logic, UI updates, and lifecycle management all live in the same file. It's like having one person at a restaurant who takes orders, cooks the food, serves the plates, AND handles the cash register. For a tiny cafe with five customers? Sure, it works. For a busy restaurant? That person is going to burn out fast.

For a simple app with 3-5 screens, MVC is fine. For anything larger, Activities grow into "god objects" with 1000+ lines, and suddenly nobody wants to touch that file.

**When MVC fits:** Quick prototypes, simple utility apps, proof-of-concept projects. If the entire feature is one screen with minimal logic, MVC is the least ceremony.

**When MVC breaks:** The moment you need to test business logic without Android, when Activities start exceeding 500 lines, or when the same logic is needed across multiple screens.

## MVP — Model-View-Presenter

So how do you fix MVC's "one person does everything" problem? You hire a manager.

MVP separates the Controller into a Presenter that has no Android dependencies. The View (Activity/Fragment) becomes passive — it implements an interface, and the Presenter calls methods on that interface to update the UI. The Presenter holds the business logic and is independently testable. Think of it as the restaurant hiring a separate head chef. The waiter (View) just takes orders and delivers food. The chef (Presenter) decides what gets cooked and how.

```kotlin
// View interface — the contract between Presenter and View
interface OrderListView {
    fun showOrders(orders: List<OrderUiModel>)
    fun showLoading()
    fun showError(message: String)
    fun navigateToDetail(orderId: String)
}

// Presenter — no Android imports, fully testable
class OrderListPresenter(
    private val repository: OrderRepository
) {
    private var view: OrderListView? = null

    fun attachView(view: OrderListView) { this.view = view }
    fun detachView() { this.view = null }

    fun loadOrders() {
        view?.showLoading()
        // ... fetch orders, call view?.showOrders(orders)
    }
}
```

MVP was the dominant architecture pattern in Android for several years. But it had its own headaches. The biggest one? Lifecycle management. You need to attach and detach the view at the right lifecycle callbacks, and forgetting to detach leaks the Activity. That's like the chef still shouting orders to a waiter who already went home for the night — except instead of wasted food, you get memory leaks.

The View interface also becomes verbose as the screen grows. Every possible UI update needs a method declaration. Twenty methods. Thirty methods. Sound fun? Yeah, I didn't think so.

**When MVP fits:** Projects that need testable business logic but can't adopt Jetpack ViewModel (legacy codebases, multi-platform shared presenters, non-standard lifecycle requirements).

**When MVP breaks:** When the View interface becomes unwieldy (20+ methods), when you need to survive configuration changes (Presenters aren't lifecycle-aware by default), or when the team size grows and the View/Presenter contracts create merge conflicts.

## MVVM — Model-View-ViewModel

MVVM replaced MVP as the recommended Android architecture when Google introduced `ViewModel` and `LiveData`. The key difference from MVP? The ViewModel doesn't hold a reference to the View. Instead, the View observes the ViewModel's state.

This is a subtle but huge shift. It's like switching from the chef yelling orders at the waiter ("Show the loading spinner! Now show the data!") to posting the order status on a board that the waiter checks whenever they're ready. If the waiter steps out for a break (configuration change, anyone?), no problem — the board still has the latest status when they come back.

This eliminates the attach/detach lifecycle problem that plagued MVP and naturally supports configuration changes since `ViewModel` survives rotation.

```kotlin
@HiltViewModel
class OrderListViewModel @Inject constructor(
    private val repository: OrderRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<OrderListState>(OrderListState.Loading)
    val uiState: StateFlow<OrderListState> = _uiState.asStateFlow()

    init { loadOrders() }

    fun loadOrders() {
        viewModelScope.launch {
            _uiState.value = OrderListState.Loading
            try {
                val orders = repository.getOrders()
                _uiState.value = OrderListState.Success(orders)
            } catch (e: Exception) {
                _uiState.value = OrderListState.Error(e.message ?: "Failed")
            }
        }
    }

    fun onOrderClicked(orderId: String) {
        // handle navigation event
    }
}
```

MVVM is the current standard recommendation from Google. It works well with Compose (composables observe StateFlow directly), it's lifecycle-aware out of the box, and the ViewModel pattern is well-understood across the Android ecosystem. Most Android libraries and samples assume MVVM. If MVVM were a restaurant, it'd be that reliable neighborhood spot everyone recommends — nothing flashy, but consistently good.

**When MVVM fits:** Most Android apps. It's the sweet spot of testability, lifecycle handling, and community support. If you have no strong reason to choose something else, MVVM is the default.

**When MVVM breaks:** When the ViewModel accumulates too many responsibilities (state management, navigation, business logic, formatting), when multiple user actions can modify the same state simultaneously causing race conditions, or when the team needs a more structured approach to state management.

> **🧠 Think about it:** If your ViewModel is handling state, navigation, formatting, AND business logic all at once — haven't you just recreated the god-Activity problem from MVC, but in a different file?

## MVI — Model-View-Intent

MVI takes MVVM further by making state management unidirectional and explicit. The View sends Intents (user actions) to the ViewModel, the ViewModel processes them through a reducer function, and a single State object is emitted back to the View. State changes are predictable because they always flow in one direction: View → Intent → Reducer → State → View.

Imagine a factory assembly line. Raw materials (user actions) go in one end. They pass through a processing station (the reducer) that transforms them step by step. A finished product (new state) comes out the other end. Nothing flows backwards. Nothing skips a step. If something goes wrong, you can inspect every station to find out exactly where the defect happened.

That's MVI. One direction. Always.

```kotlin
// State — single immutable object describing the screen
data class OrderListState(
    val orders: List<OrderUiModel> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val selectedFilter: OrderFilter = OrderFilter.ALL
)

// Intent — every possible user action
sealed interface OrderListIntent {
    data object LoadOrders : OrderListIntent
    data object Refresh : OrderListIntent
    data class FilterChanged(val filter: OrderFilter) : OrderListIntent
    data class OrderClicked(val orderId: String) : OrderListIntent
    data object ErrorDismissed : OrderListIntent
}

@HiltViewModel
class OrderListViewModel @Inject constructor(
    private val repository: OrderRepository
) : ViewModel() {

    private val _state = MutableStateFlow(OrderListState())
    val state: StateFlow<OrderListState> = _state.asStateFlow()

    fun handleIntent(intent: OrderListIntent) {
        when (intent) {
            is OrderListIntent.LoadOrders -> loadOrders()
            is OrderListIntent.Refresh -> refresh()
            is OrderListIntent.FilterChanged -> applyFilter(intent.filter)
            is OrderListIntent.OrderClicked -> navigateToDetail(intent.orderId)
            is OrderListIntent.ErrorDismissed -> {
                _state.update { it.copy(error = null) }
            }
        }
    }

    private fun loadOrders() {
        viewModelScope.launch {
            _state.update { it.copy(isLoading = true) }
            try {
                val orders = repository.getOrders()
                _state.update { it.copy(orders = orders, isLoading = false) }
            } catch (e: Exception) {
                _state.update { it.copy(error = e.message, isLoading = false) }
            }
        }
    }

    private fun applyFilter(filter: OrderFilter) {
        _state.update { it.copy(selectedFilter = filter) }
        loadOrders()  // reload with new filter
    }
}
```

The unidirectional flow makes debugging easier — you can log every Intent and every State transition to see exactly what happened. State is always consistent because there's a single mutable reference. And the sealed interface of Intents documents every possible user action exhaustively. No more "where did this state change come from?" mysteries.

But here's the cost: look at all that code for what's basically a list screen with a filter. For a screen with two buttons and a list, MVI is like hiring a full security team to guard your house cat. Technically thorough? Absolutely. Necessary? Not even close.

**When MVI fits:** Complex screens with many user interactions, apps that need detailed state debugging (financial apps, editors), teams that benefit from strict patterns and want to eliminate "where does this state come from?" questions.

**When MVI breaks:** Simple screens where the overhead of defining Intents and a reducer for every action is ceremony without benefit. If your screen has two buttons and a list, MVI is overkill.

## The Decision Framework

Instead of asking "which architecture should I use," flip the question. Ask these instead:

**How many developers are working on this?** A solo developer can keep the architecture in their head. A team of ten needs explicit patterns that everyone follows. Larger teams benefit from the structure of MVI or strict MVVM because it reduces ambiguity in code reviews. When five people are editing the same ViewModel and nobody agrees on where navigation logic goes, you've got a problem that structure solves.

**How complex is the business logic?** CRUD apps with simple data display need MVVM at most. Apps with complex state machines (editors, financial workflows, multi-step processes) benefit from MVI's explicit state management.

**How long will this project be maintained?** A prototype that ships in two weeks can use MVC. A product that will be maintained for years needs the testability and separation that MVVM or MVI provide. You're not just writing code for today — you're writing code for the poor developer who inherits this project in eighteen months. That developer might be you.

**Does the team have experience with the pattern?** This one is huge, and I think people underestimate it. An architecture the team knows well and uses consistently will produce better results than a theoretically superior architecture that's poorly understood. If the team knows MVVM, don't switch to MVI for a new project unless there's a specific problem MVVM can't solve.

> **🔥 Real talk:** I've seen teams spend weeks migrating to a "better" architecture only to end up with a codebase that's half old pattern, half new pattern, and fully confusing. The migration itself introduced more bugs than the original architecture ever did.

**What problems are you actually experiencing?** Architecture changes should solve real problems, not hypothetical ones. If you're not having testability issues, don't add layers just for testability. If you're not having state consistency bugs, you don't need MVI's strict unidirectional flow. Solving problems you don't have is a great way to create problems you didn't need.

## My Practical Recommendations

For **small apps** (personal projects, utilities, 5-10 screens, one developer): MVVM with ViewModel + StateFlow + Repository. No use cases, no domain layer, no multi-module. Keep it simple. You wouldn't build scaffolding to hang a picture frame.

For **medium apps** (startup products, 10-30 screens, 2-5 developers): MVVM with Clean Architecture layers (data, domain optional, presentation). Multi-module when build times start hurting. Convention plugins for consistent setup.

For **large apps** (enterprise products, 30+ screens, 5+ developers): MVI or strict MVVM with unidirectional data flow, full Clean Architecture, multi-module with feature/core split, comprehensive testing strategy.

> **💡 The "aha" moment:** The best architecture isn't the most sophisticated one — it's the simplest one that solves your actual problems. You can always add more structure later. You can't easily remove structure that's already baked into fifty screens.

## The Reframe — Architecture Is a Tradeoff, Not a Score

Here's what I think most architecture discussions get wrong: **there's no "best" architecture. There's only the best fit for your constraints.** MVC isn't bad — it's fast to build and easy to understand. MVI isn't good — it's verbose and requires more boilerplate. The question is always which tradeoffs are acceptable for this project, this team, and this timeline.

The worst architectural mistake isn't picking the wrong pattern. It's picking an architecture and then not following it consistently. A team that does MVVM well — with consistent state management, clear separation, and good testing — will ship better software than a team that does MVI poorly, with half the screens following the pattern and half not. Consistency beats cleverness, every single time.

Start with the simplest architecture that solves your current problems. Add structure when you feel the pain of not having it. And remember that refactoring from MVVM to MVI is a lot easier than refactoring from no architecture to any architecture. The foundations matter more than the specific pattern.

Thanks for reading!
