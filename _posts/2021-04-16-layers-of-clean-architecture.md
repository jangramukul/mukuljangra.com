---
title: Understanding the Layers of Clean Architecture
layout: post
categories: post
tags:
  - Android
  - Architecture
---

In the previous posts, I covered what Clean Architecture is and the principles behind it. Now here's where it gets interesting — the part where theory meets your actual codebase.

The most common question I get from developers adopting Clean Architecture is deceptively simple: "what code goes where?" Data, Domain, Presentation. Three layers. Sounds clean. But the moment you start building a real feature, the edges get blurry fast. Where does mapping happen? Who owns the error handling? Can the ViewModel call the repository directly, or must everything go through a use case?

Think of it like a restaurant. You've got the kitchen (data layer), the chef's recipes and rules (domain layer), and the dining room where customers interact (presentation layer). A customer never walks into the kitchen and grabs food off the stove. The waiter doesn't decide how to cook the steak. Everyone has a role, and things only break down when someone reaches across boundaries they shouldn't. That's Clean Architecture in a nutshell — clear responsibilities, clear boundaries.

I'm going to walk through each layer with real code and the real decisions I've had to make.

## The Data Layer — Where the Outside World Lives

The data layer handles all interactions with external systems — network APIs, local databases, file storage, shared preferences, and device sensors. It's the outermost layer and the one that changes most frequently. API contracts change, you migrate from SharedPreferences to DataStore, you swap Moshi for Kotlin Serialization.

Here's the thing — all of that chaos? The data layer absorbs it. It's like the loading dock at the back of our restaurant. Deliveries come and go, suppliers change, the truck schedule shifts. But the kitchen doesn't care. The chef gets the same ingredients in the same bins regardless. That's exactly what the data layer does for your app: it shields everything inside from the volatility of the outside world.

The data layer contains three main types of components:

**Data Sources** are the direct interfaces to external systems. A `RemoteOrderDataSource` wraps Retrofit calls. A `LocalOrderDataSource` wraps Room queries. Each data source handles only one system — no data source should call both the API and the database. One source, one job.

**Repositories** coordinate between data sources. They implement the interfaces defined in the domain layer and contain the logic for "where does this data come from?" — cache first, then network? Always network? Optimistic update? The repository is where your caching strategy, offline-first logic, and data synchronization live. It's the decision-maker that says "I have this locally, no need to bother the server."

**Data Models** are the raw representations from external systems. `OrderDto` for API responses, `OrderEntity` for database tables. These never leak outside the data layer — they're mapped to domain models at the repository boundary. Why? Because your business logic shouldn't care whether the data came from Retrofit or Room. It just wants an `Order`.

```kotlin
// Data Source — wraps a single external system
class RemoteOrderDataSource(
    private val api: OrderApi
) {
    suspend fun fetchOrders(): List<OrderDto> = api.getOrders()
    suspend fun fetchOrder(id: String): OrderDto = api.getOrder(id)
    suspend fun submitOrder(request: CreateOrderRequest): OrderDto = api.createOrder(request)
}

class LocalOrderDataSource(
    private val dao: OrderDao
) {
    fun observeOrders(): Flow<List<OrderEntity>> = dao.observeAll()
    suspend fun getOrder(id: String): OrderEntity? = dao.getById(id)
    suspend fun saveOrders(orders: List<OrderEntity>) = dao.insertAll(orders)
    suspend fun deleteOrder(id: String) = dao.deleteById(id)
}

// Repository — coordinates sources, maps to domain models
class OrderRepositoryImpl(
    private val remote: RemoteOrderDataSource,
    private val local: LocalOrderDataSource,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO
) : OrderRepository {

    override fun observeOrders(): Flow<List<Order>> {
        return local.observeOrders()
            .map { entities -> entities.map { it.toDomain() } }
    }

    override suspend fun refreshOrders() {
        withContext(ioDispatcher) {
            val dtos = remote.fetchOrders()
            val entities = dtos.map { it.toEntity() }
            local.saveOrders(entities)
        }
    }

    override suspend fun placeOrder(order: Order): Result<Order> {
        return withContext(ioDispatcher) {
            try {
                val request = order.toCreateRequest()
                val dto = remote.submitOrder(request)
                val entity = dto.toEntity()
                local.saveOrders(listOf(entity))
                Result.success(entity.toDomain())
            } catch (e: IOException) {
                Result.failure(e)
            }
        }
    }
}
```

Look at `observeOrders()`. The local data source returns `Flow<List<OrderEntity>>` — a Room thing. But the repository maps it to `Flow<List<Order>>` — a domain thing. The caller never knows (or cares) that Room was involved. That's the boundary doing its job.

The mapping functions (`toDomain()`, `toEntity()`, `toCreateRequest()`) are simple extension functions that live in the data layer. They translate between representations at the layer boundary. Some teams create dedicated `Mapper` classes, but I find extension functions cleaner — they're discoverable, concise, and don't need their own dependency injection.

One architectural decision worth noting: the repository wraps network errors in `Result` rather than letting exceptions propagate. This means the domain and presentation layers handle explicit success/failure states instead of try/catch blocks. IMO, this is cleaner — you can pattern-match on `Result.success` and `Result.failure` instead of wrapping everything in try/catch and hoping you caught the right exception type. But some teams prefer exceptions. Either approach works as long as you're consistent.

## The Domain Layer — Pure Business Logic

The domain layer is the core of your application. It contains business entities, use cases, and repository interfaces — and nothing else. No Android imports, no framework dependencies, no external library types. Just Kotlin.

This is important, so let me say it differently. If you pulled the domain layer out of your Android project and dropped it into a pure Kotlin project — a backend service, a desktop app, whatever — it should compile without changing a single line. That's how clean it should be. It knows nothing about Android. It's pure business logic, living in its own little world.

Going back to the restaurant analogy: the domain layer is the recipe book and the house rules. "We don't serve raw chicken." "Every dish must be plated before it leaves the kitchen." These rules exist regardless of whether you're running a food truck or a five-star restaurant. The rules don't change when you swap out the stove.

**Domain Models** represent the core concepts of your business. `Order`, `Product`, `Customer` — these are the nouns of your application. They carry business-relevant data and validation rules, not database column names or API field annotations.

**Use Cases** (also called interactors) encapsulate a single business operation. `PlaceOrderUseCase`, `GetPendingOrdersUseCase`, `CalculateOrderTotalUseCase`. Each use case does one thing and takes the dependencies it needs through its constructor.

**Repository Interfaces** define what data operations the domain layer needs, without specifying how they're implemented. This is the dependency inversion — the domain layer defines the contract, the data layer provides the implementation.

> **🧠 Think about it:** Why does the domain layer define the repository *interface* but not the *implementation*? What would break if the data layer defined both?

The answer is control. If the data layer owned the interface, it could change the contract whenever it wanted, and your business logic would have to follow. By having the domain layer define what it needs, the data layer has to conform to the domain's expectations. The dependency points inward, not outward. That's dependency inversion in action.

```kotlin
// Domain model — business-relevant data only
data class Order(
    val id: String,
    val customerName: String,
    val items: List<OrderItem>,
    val status: OrderStatus,
    val createdAt: Instant,
    val total: Double
) {
    val isEditable: Boolean get() = status == OrderStatus.PENDING
    val itemCount: Int get() = items.sumOf { it.quantity }
}

// Repository interface — defined in domain, implemented in data
interface OrderRepository {
    fun observeOrders(): Flow<List<Order>>
    suspend fun refreshOrders()
    suspend fun placeOrder(order: Order): Result<Order>
    suspend fun getOrder(id: String): Order?
}

// Use case — single business operation
class PlaceOrderUseCase(
    private val orderRepository: OrderRepository,
    private val inventoryRepository: InventoryRepository
) {
    suspend operator fun invoke(order: Order): Result<Order> {
        // Business rule: can't place order with out-of-stock items
        val outOfStock = order.items.filter { item ->
            val available = inventoryRepository.getAvailableQuantity(item.productId)
            available < item.quantity
        }

        if (outOfStock.isNotEmpty()) {
            val names = outOfStock.joinToString { it.productName }
            return Result.failure(
                InsufficientInventoryException("Out of stock: $names")
            )
        }

        return orderRepository.placeOrder(order)
    }
}
```

Notice the `PlaceOrderUseCase`. It coordinates two repositories — `OrderRepository` and `InventoryRepository` — to enforce a business rule: you can't place an order if items are out of stock. Now, where else could this logic live?

The ViewModel? That's UI territory. What if you need the same check when processing orders from a background job or a push notification? You'd have to duplicate it. The repository? The `OrderRepository` shouldn't know about inventory — that's a different concern. The use case is the natural home for logic that crosses data boundaries.

> **💡 The "aha" moment:** Use cases aren't just a "Clean Architecture ceremony tax." They're the answer to "where do I put logic that needs data from multiple sources?" If that logic lives in the ViewModel, you can't reuse it. If it lives in a repository, you're coupling unrelated data concerns. The use case sits in between, coordinates, and keeps everyone else focused on their own job.

When is the domain layer worth it? When you have business rules that coordinate multiple data sources (like the inventory check above). When multiple features share the same logic. When the business logic is complex enough that testing it without Android dependencies saves significant time. For simple pass-through operations where the ViewModel just calls the repository and maps the result, use cases add ceremony without value. I know that sounds like I'm contradicting myself, but being pragmatic about when to use a pattern is part of understanding the pattern.

## The Presentation Layer — State and UI

The presentation layer contains ViewModels, UI state models, and the actual UI (Composables, Fragments, Activities). Its job is to transform domain data into something the UI can render, handle user interactions, and manage screen-level state.

If the domain layer is the recipe book, the presentation layer is the waiter and the menu. The waiter takes "grilled salmon with asparagus" from the kitchen and presents it beautifully on a plate. The menu shows the customer a formatted price ("$24.99"), not the raw cost data the chef works with. That translation from "business data" to "what the user sees" — that's the presentation layer's entire purpose.

**ViewModels** sit between the domain layer and the UI. They call use cases or repositories, transform the results into UI state, and expose that state as observable streams. They don't know about Android views, Compose, or navigation implementation details.

**UI State Models** are data classes that fully describe what the screen should show at any moment. The UI should be a pure function of the state — given this state, the screen always looks the same. No ambiguity, no hidden state lurking somewhere else.

**UI Components** (Composables, Fragments) observe the state and render it. They capture user actions and forward them to the ViewModel. They don't contain business logic, data transformations, or direct data access.

```kotlin
// UI State — fully describes what the screen shows
data class OrderListUiState(
    val orders: List<OrderUiModel> = emptyList(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val errorMessage: String? = null
)

data class OrderUiModel(
    val id: String,
    val customerName: String,
    val formattedTotal: String,
    val formattedDate: String,
    val statusLabel: String,
    val statusColor: Color,
    val itemCount: Int
)

// ViewModel — transforms domain data to UI state
@HiltViewModel
class OrderListViewModel @Inject constructor(
    private val observeOrders: ObserveOrdersUseCase,
    private val refreshOrders: RefreshOrdersUseCase
) : ViewModel() {

    private val _uiState = MutableStateFlow(OrderListUiState(isLoading = true))
    val uiState: StateFlow<OrderListUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            observeOrders().collect { orders ->
                _uiState.update { state ->
                    state.copy(
                        orders = orders.map { it.toUiModel() },
                        isLoading = false
                    )
                }
            }
        }
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            try {
                refreshOrders()
            } catch (e: Exception) {
                _uiState.update { it.copy(errorMessage = e.message) }
            } finally {
                _uiState.update { it.copy(isRefreshing = false) }
            }
        }
    }

    private fun Order.toUiModel() = OrderUiModel(
        id = id,
        customerName = customerName,
        formattedTotal = "$${String.format("%.2f", total)}",
        formattedDate = createdAt.format(DateTimeFormatter.ofPattern("MMM d, yyyy")),
        statusLabel = status.name.lowercase().replaceFirstChar { it.uppercase() },
        statusColor = when (status) {
            OrderStatus.PENDING -> Color(0xFFFFA726)
            OrderStatus.PROCESSING -> Color(0xFF42A5F5)
            OrderStatus.SHIPPED -> Color(0xFF66BB6A)
            OrderStatus.DELIVERED -> Color(0xFF4CAF50)
            OrderStatus.CANCELLED -> Color(0xFFEF5350)
        },
        itemCount = itemCount
    )
}
```

See that `toUiModel()` function? It takes a domain `Order` and turns it into something the screen can directly render. Formatting `total` into `"$24.99"`, converting `createdAt` into `"Jan 5, 2024"`, mapping `OrderStatus.PENDING` to an orange color — that's all presentation logic. It belongs here, not in the domain model. Your domain model shouldn't know what color "pending" is. That's a UI decision.

The mapping from `Order` (domain) to `OrderUiModel` (UI) happens in the ViewModel. Formatting prices, formatting dates, choosing colors based on status — that's all presentation logic that belongs in this layer, not in the domain model. If you ever find yourself adding a `getFormattedPrice()` method to your domain `Order` class, stop. That's the presentation layer leaking inward.

## How Layers Communicate

The communication pattern is straightforward: each layer only calls the layer directly below it, and data flows back up through return values or reactive streams. Think of it like a chain of command — orders go down, results come back up. Nobody skips a level.

**Presentation → Domain**: The ViewModel calls use cases or repository interfaces. Never directly calls data sources. If your ViewModel has a reference to a `Dao` or a Retrofit `Api`, something has gone wrong.

**Domain → Data**: Use cases and repository interfaces are defined in the domain layer. The data layer provides implementations. Dependency injection (Hilt, manual DI) connects them at runtime.

**Data → Domain**: The data layer returns domain models, not DTOs or entities. Mapping happens at the repository boundary.

**Data → Presentation**: This should never happen directly. Data always flows through the domain layer (or at minimum, through the repository interface defined in the domain layer). If a ViewModel imports a Retrofit class or a Room entity, the architecture is leaking.

> **⚡ Quick check:** Open one of your ViewModels right now. Look at the imports. Do you see any Room, Retrofit, or Moshi imports? If you do, your presentation layer is reaching into the data layer — and that's a boundary violation worth fixing.

The tradeoff with strict layering is more code — mappers, interfaces, use cases for simple operations. Yeah, that's a lot of boilerplate for a simple feature. But the benefit is that each layer is independently testable, and changes in one layer don't ripple to others. Swap your database from Room to SQLDelight? Only the data layer changes. Rewrite your UI from XML to Compose? Only the presentation layer changes. The domain layer doesn't even notice.

In practice, I've found the tradeoff worth it for any project that lasts more than a few months or has more than one developer. The time saved in debugging and onboarding pays for the upfront ceremony. When a new developer joins and asks "where does the caching logic go?", the answer is always the same: the repository in the data layer. When a bug shows up in price calculation, you know exactly where to look: the domain layer. That predictability is the real payoff.

Thanks for reading!
