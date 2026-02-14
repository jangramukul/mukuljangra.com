---
title: Understanding the Layers of Clean Architecture
layout: post
categories: post
tags:
  - Android
  - Architecture
---

In the previous posts, I covered what Clean Architecture is and the principles behind it. Now let's get concrete. The most common question I get from developers adopting Clean Architecture is "what code goes where?" The three-layer model — Data, Domain, and Presentation — sounds simple in theory, but the edges get blurry when you're actually building features. Where does mapping happen? Who owns the error handling? Can the ViewModel call the repository directly, or must everything go through a use case? Let me walk through each layer with real code and real decisions.

## The Data Layer — Where the Outside World Lives

The data layer handles all interactions with external systems — network APIs, local databases, file storage, shared preferences, and device sensors. It's the outermost layer and the one that changes most frequently. API contracts change, you migrate from SharedPreferences to DataStore, you swap Moshi for Kotlin Serialization. The data layer absorbs all of that volatility, protecting the rest of your app.

The data layer contains three main types of components:

**Data Sources** are the direct interfaces to external systems. A `RemoteOrderDataSource` wraps Retrofit calls. A `LocalOrderDataSource` wraps Room queries. Each data source handles only one system — no data source should call both the API and the database.

**Repositories** coordinate between data sources. They implement the interfaces defined in the domain layer and contain the logic for "where does this data come from?" — cache first, then network? Always network? Optimistic update? The repository is where your caching strategy, offline-first logic, and data synchronization live.

**Data Models** are the raw representations from external systems. `OrderDto` for API responses, `OrderEntity` for database tables. These never leak outside the data layer — they're mapped to domain models at the repository boundary.

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

The mapping functions (`toDomain()`, `toEntity()`, `toCreateRequest()`) are simple extension functions that live in the data layer. They translate between representations at the layer boundary. Some teams create dedicated `Mapper` classes, but I find extension functions cleaner — they're discoverable, concise, and don't need their own dependency injection.

One architectural decision worth noting: the repository wraps network errors in `Result` rather than letting exceptions propagate. This means the domain and presentation layers handle explicit success/failure states instead of try/catch blocks. IMO, this is cleaner, but some teams prefer exceptions. Either approach works as long as you're consistent.

## The Domain Layer — Pure Business Logic

The domain layer is the core of your application. It contains business entities, use cases, and repository interfaces — and nothing else. No Android imports, no framework dependencies, no external library types. Just Kotlin.

**Domain Models** represent the core concepts of your business. `Order`, `Product`, `Customer` — these are the nouns of your application. They carry business-relevant data and validation rules, not database column names or API field annotations.

**Use Cases** (also called interactors) encapsulate a single business operation. `PlaceOrderUseCase`, `GetPendingOrdersUseCase`, `CalculateOrderTotalUseCase`. Each use case does one thing and takes the dependencies it needs through its constructor.

**Repository Interfaces** define what data operations the domain layer needs, without specifying how they're implemented. This is the dependency inversion — the domain layer defines the contract, the data layer provides the implementation.

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

The use case here contains a genuine business rule — you can't place an order if items are out of stock. This logic doesn't belong in the ViewModel (it's not UI logic), and it doesn't belong in the repository (it's not data access logic). It's a business decision that should be independently testable.

When is the domain layer worth it? When you have business rules that coordinate multiple data sources (like the inventory check above). When multiple features share the same logic. When the business logic is complex enough that testing it without Android dependencies saves significant time. For simple pass-through operations where the ViewModel just calls the repository and maps the result, use cases add ceremony without value.

## The Presentation Layer — State and UI

The presentation layer contains ViewModels, UI state models, and the actual UI (Composables, Fragments, Activities). Its job is to transform domain data into something the UI can render, handle user interactions, and manage screen-level state.

**ViewModels** sit between the domain layer and the UI. They call use cases or repositories, transform the results into UI state, and expose that state as observable streams. They don't know about Android views, Compose, or navigation implementation details.

**UI State Models** are data classes that fully describe what the screen should show at any moment. The UI should be a pure function of the state — given this state, the screen always looks the same.

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

The mapping from `Order` (domain) to `OrderUiModel` (UI) happens in the ViewModel. Formatting prices, formatting dates, choosing colors based on status — that's all presentation logic that belongs in this layer, not in the domain model.

## How Layers Communicate

The communication pattern is straightforward: each layer only calls the layer directly below it, and data flows back up through return values or reactive streams.

**Presentation → Domain**: The ViewModel calls use cases or repository interfaces. Never directly calls data sources.

**Domain → Data**: Use cases and repository interfaces are defined in the domain layer. The data layer provides implementations. Dependency injection (Hilt, manual DI) connects them at runtime.

**Data → Domain**: The data layer returns domain models, not DTOs or entities. Mapping happens at the repository boundary.

**Data → Presentation**: This should never happen directly. Data always flows through the domain layer (or at minimum, through the repository interface defined in the domain layer). If a ViewModel imports a Retrofit class or a Room entity, the architecture is leaking.

The tradeoff with strict layering is more code — mappers, interfaces, use cases for simple operations. The benefit is that each layer is independently testable, and changes in one layer don't ripple to others. In practice, I've found the tradeoff worth it for any project that lasts more than a few months or has more than one developer. The time saved in debugging and onboarding pays for the upfront ceremony.

Thank You!
