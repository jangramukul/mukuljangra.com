---
title: Introduction to Clean Architecture
layout: post
sequence: 15
categories: post
tags:
  - Android
  - Architecture
---

When I started my first production Android project, the codebase was one module with Activities that did everything — network calls, database queries, JSON parsing, UI updates, validation. Adding a new feature meant copy-pasting an existing Activity and modifying it. Testing was nonexistent because every class depended on Android framework classes. The app worked, shipped, and was a maintenance nightmare within six months. That experience taught me that architecture isn't an academic exercise — it's the difference between a codebase you can evolve and one that fights you on every change.

Clean Architecture, as Robert C. Martin (Uncle Bob) originally described it, is a set of principles for organizing code so that business logic is independent of frameworks, databases, and UI. The core idea is deceptively simple: **dependencies should point inward.** Your business logic shouldn't know or care whether data comes from a REST API or a local database. Your domain models shouldn't know they're being rendered in an Android Activity or a Compose screen. This separation isn't just theoretical — it directly determines how testable, maintainable, and adaptable your codebase is.

## The Dependency Rule

The dependency rule is the single most important concept in Clean Architecture, and everything else follows from it. **Inner layers must not depend on outer layers.** Your domain layer (business logic, use cases, entity models) sits at the center and depends on nothing. Your data layer (repositories, network, database) depends on the domain layer's interfaces but not on the presentation layer. Your presentation layer (ViewModels, UI) depends on the domain layer and — indirectly — on the data layer through dependency injection.

In practice, this means your domain layer defines interfaces like `OrderRepository`, and the data layer provides the implementation. The domain layer never imports `Retrofit`, `Room`, or any Android class. It's pure Kotlin. This is what makes it testable without Robolectric or an Android emulator — you can run domain layer tests as plain JVM unit tests.

```kotlin
// Domain layer — pure Kotlin, no Android imports
interface OrderRepository {
    suspend fun getOrders(): List<Order>
    suspend fun getOrderById(id: String): Order?
    suspend fun placeOrder(order: Order): Result<Order>
}

data class Order(
    val id: String,
    val customerName: String,
    val items: List<OrderItem>,
    val total: Double,
    val status: OrderStatus
)

// Use case — single business operation
class GetPendingOrdersUseCase(
    private val repository: OrderRepository
) {
    suspend operator fun invoke(): List<Order> {
        return repository.getOrders()
            .filter { it.status == OrderStatus.PENDING }
            .sortedByDescending { it.total }
    }
}
```

The use case doesn't know if `OrderRepository` hits a network API, reads from a database, or returns hardcoded data. That's the whole point. In tests, you pass a fake. In production, Hilt provides the real implementation. The business logic is the same either way.

## A Real Project Structure

A lot of Clean Architecture explanations stay abstract. Here's what the folder structure actually looks like in a real Android project:

- **:core:domain** — `Order.kt`, `OrderRepository.kt` (interface), `GetPendingOrdersUseCase.kt`, `PlaceOrderUseCase.kt`. Pure Kotlin module, no Android dependency.
- **:core:data** — `OrderRepositoryImpl.kt`, `OrderApi.kt` (Retrofit), `OrderDao.kt` (Room), `OrderEntity.kt`, `OrderDto.kt`, mappers. Depends on `:core:domain`.
- **:feature:orders** — `OrderListViewModel.kt`, `OrderListScreen.kt` (Compose), `OrderUiState.kt`. Depends on `:core:domain`.
- **:app** — Wires everything together with Hilt modules. Depends on all feature and core modules.

The key observation is that `:feature:orders` depends on `:core:domain` but NOT on `:core:data`. The ViewModel knows about `GetPendingOrdersUseCase` and `Order`, but it has no idea that Retrofit and Room exist. This is the dependency rule in action — the feature module doesn't know where data comes from.

## How Data Flows Through Layers

Understanding the data flow makes the architecture concrete. When the user opens the orders screen:

1. `OrderListScreen` (Compose) observes `OrderListViewModel.uiState`
2. `OrderListViewModel` calls `GetPendingOrdersUseCase()`
3. `GetPendingOrdersUseCase` calls `OrderRepository.getOrders()`
4. `OrderRepositoryImpl` (data layer) fetches from the API, maps DTOs to domain `Order` models, caches in Room
5. The domain `Order` list flows back up through the use case, which filters and sorts
6. The ViewModel maps `Order` to `OrderUiModel` and updates `uiState`
7. Compose recomposes with the new state

Data crosses layer boundaries through mapping. `OrderDto` (from the API) → `OrderEntity` (for the database) → `Order` (domain model) → `OrderUiModel` (for the UI). Each model carries only what that layer needs. The UI model might have formatted price strings and display-ready dates. The domain model has raw business data. The DTO has whatever the API returns.

```kotlin
// Data layer — mapping between representations
class OrderRepositoryImpl(
    private val api: OrderApi,
    private val dao: OrderDao
) : OrderRepository {

    override suspend fun getOrders(): List<Order> {
        return try {
            val dtos = api.fetchOrders()
            val entities = dtos.map { it.toEntity() }
            dao.insertAll(entities)
            entities.map { it.toDomain() }
        } catch (e: IOException) {
            dao.getAllOrders().map { it.toDomain() }
        }
    }
}

// Mappers are simple extension functions
fun OrderDto.toEntity() = OrderEntity(
    orderId = id,
    customerName = customer.name,
    totalAmount = total,
    status = status,
    createdAt = createdAt
)

fun OrderEntity.toDomain() = Order(
    id = orderId,
    customerName = customerName,
    items = emptyList(),
    total = totalAmount,
    status = OrderStatus.valueOf(status)
)
```

## When Clean Architecture Is Overkill

Here's an honest take that most architecture articles avoid: **Clean Architecture adds real cost, and it's not always worth it.**

For a small app — a personal project, a prototype, a tool with 3-5 screens — the three-layer separation with use cases, repository interfaces, and domain models is over-engineering. You'll spend more time writing mappers and abstractions than building features. A single-module app with ViewModels calling repositories directly is perfectly fine for small codebases.

Clean Architecture pays off when: the app has multiple feature modules that need to share business logic, the team has more than two or three developers who need clear boundaries, the app will be maintained for years and the data sources might change (migrating from REST to GraphQL, swapping Room for DataStore), or the business logic is complex enough that it needs comprehensive unit testing independent of Android.

The real decision isn't "should I use Clean Architecture or not." It's "which parts of Clean Architecture does this project need." Maybe you need the repository pattern for testability but don't need use cases because your business logic is simple. Maybe you need domain models separate from DTOs but don't need a separate domain module. Take what you need, leave the rest.

## The Reframe — Architecture Is About Change, Not Structure

Here's what I think most developers misunderstand about Clean Architecture: **it's not about organizing files into folders. It's about making change cheap.** The dependency rule exists so that changing your database doesn't break your UI. The domain layer exists so that business logic can be tested without booting an emulator. Use cases exist so that business operations can be composed and reused across features.

If your app never changes its data sources, never adds new features, and is maintained by one person, you don't need Clean Architecture. But in my experience, apps always change in ways you don't predict. The API gets redesigned. The product team wants offline support. A new feature needs the same business logic as an existing one but with a different UI. Clean Architecture makes those changes local instead of global — you modify one layer without breaking the others.

The architecture that matters isn't the one in the diagram. It's the one that lets your team ship features confidently without breaking existing functionality. Clean Architecture is one way to get there, and for apps with real complexity and real teams, I think it's the most practical approach we have.

Thank You!
