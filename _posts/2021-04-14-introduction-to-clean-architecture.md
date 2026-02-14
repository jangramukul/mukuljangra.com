---
title: Introduction to Clean Architecture
layout: post
categories: post
tags:
  - Android
  - Architecture
---

Imagine you just joined a team and opened the codebase for the first time. You find Activities that make network calls, parse JSON, query the database, validate input, and update the UI — all in the same file. Need a new feature? Copy-paste an existing Activity and hack it until it works. Want to write a test? Good luck — every class is welded to the Android framework. That was my first production Android project. The app shipped, it worked, and within six months it became a codebase that actively fought us on every single change.

That experience rewired how I think about code. Architecture isn't some UML diagram you draw in a meeting and forget about. It's the thing that decides whether adding a feature takes a day or a week, whether a bug fix breaks three other screens, whether a new teammate can actually contribute without fear.

Clean Architecture, as Robert C. Martin (Uncle Bob) originally described it, is a set of principles for organizing code so that business logic is independent of frameworks, databases, and UI. The core idea is deceptively simple: **dependencies should point inward.** Think of it like an onion. The juicy business logic sits at the very center, and it has absolutely no idea what's happening in the outer layers. Your domain models don't know if they're being rendered in an Android Activity or a Compose screen. Your business rules don't care if data comes from a REST API or a local database. This separation isn't just theoretical — it directly determines how testable, maintainable, and adaptable your codebase is.

## The Dependency Rule

Here's the one rule that, if you get right, everything else falls into place. **Inner layers must not depend on outer layers.** That's it. That's the whole game.

Think of it like a company org chart — but upside down. Your domain layer (business logic, use cases, entity models) is the CEO. It sits at the center and depends on nothing. It doesn't know who works in the mailroom, and it doesn't care. Your data layer (repositories, network, database) depends on the domain layer's interfaces but not on the presentation layer. Your presentation layer (ViewModels, UI) depends on the domain layer and — indirectly — on the data layer through dependency injection.

In practice, this means your domain layer defines interfaces like `OrderRepository`, and the data layer provides the implementation. The domain layer never imports `Retrofit`, `Room`, or any Android class. It's pure Kotlin. And that's what makes it testable without Robolectric or an Android emulator — you can run domain layer tests as plain JVM unit tests.

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

Look at that use case. It filters orders and sorts them. That's business logic in its purest form. It doesn't know if `OrderRepository` hits a network API, reads from a database, or returns hardcoded data. That's the whole point. In tests, you pass a fake. In production, Hilt provides the real implementation. The business logic is the same either way.

> **💡 The "aha" moment:** The domain layer is like a recipe. It says "get the ingredients, mix them, bake at 350°F." It doesn't care if the ingredients come from a grocery store, your garden, or a neighbor's fridge. The recipe works regardless.

## A Real Project Structure

A lot of Clean Architecture explanations stay abstract — circles within circles, arrows pointing inward, and then you're left staring at your IDE wondering "but where do I put the files?" Here's what the folder structure actually looks like in a real Android project:

- **:core:domain** — `Order.kt`, `OrderRepository.kt` (interface), `GetPendingOrdersUseCase.kt`, `PlaceOrderUseCase.kt`. Pure Kotlin module, no Android dependency.
- **:core:data** — `OrderRepositoryImpl.kt`, `OrderApi.kt` (Retrofit), `OrderDao.kt` (Room), `OrderEntity.kt`, `OrderDto.kt`, mappers. Depends on `:core:domain`.
- **:feature:orders** — `OrderListViewModel.kt`, `OrderListScreen.kt` (Compose), `OrderUiState.kt`. Depends on `:core:domain`.
- **:app** — Wires everything together with Hilt modules. Depends on all feature and core modules.

Now here's where it gets interesting. Notice that `:feature:orders` depends on `:core:domain` but NOT on `:core:data`. The ViewModel knows about `GetPendingOrdersUseCase` and `Order`, but it has no idea that Retrofit and Room exist. Zero. Zip. The feature module doesn't know where data comes from, and it shouldn't. That's the dependency rule doing its job.

## How Data Flows Through Layers

OK, so we've got these nice separate layers. But how does data actually travel through them? Imagine the user taps on the orders screen. Here's the chain of events:

1. `OrderListScreen` (Compose) observes `OrderListViewModel.uiState`
2. `OrderListViewModel` calls `GetPendingOrdersUseCase()`
3. `GetPendingOrdersUseCase` calls `OrderRepository.getOrders()`
4. `OrderRepositoryImpl` (data layer) fetches from the API, maps DTOs to domain `Order` models, caches in Room
5. The domain `Order` list flows back up through the use case, which filters and sorts
6. The ViewModel maps `Order` to `OrderUiModel` and updates `uiState`
7. Compose recomposes with the new state

It's like a relay race. The baton changes shape at every handoff — `OrderDto` (from the API) becomes `OrderEntity` (for the database) becomes `Order` (domain model) becomes `OrderUiModel` (for the UI). Each model carries only what that layer needs. The UI model might have formatted price strings and display-ready dates. The domain model has raw business data. The DTO has whatever the API returns.

"Wait, that's a lot of model classes for the same data."

Yeah, it is. And that's a real tradeoff. But each model serves a specific purpose, and when the API response shape changes (and it will), you only update the DTO and its mapper — the rest of your app doesn't even notice.

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

Notice something in `getOrders()`? When the network call fails, it silently falls back to the local cache. The use case and the ViewModel have no idea this happened. They just get a list of `Order` objects. That's the beauty of the layer boundary — the data layer handles the messy reality of networks and caches, and everyone else gets a clean interface.

## When Clean Architecture Is Overkill

> **🔥 Real talk:** Clean Architecture adds real cost, and it's not always worth it. Most architecture articles won't tell you that, but I will.

For a small app — a personal project, a prototype, a tool with 3-5 screens — the three-layer separation with use cases, repository interfaces, and domain models is over-engineering. You'll spend more time writing mappers and abstractions than building features. A single-module app with ViewModels calling repositories directly is perfectly fine for small codebases.

So when does Clean Architecture actually earn its keep? When the app has multiple feature modules that need to share business logic. When the team has more than two or three developers who need clear boundaries so they're not stepping on each other's code. When the app will be maintained for years and the data sources might change — migrating from REST to GraphQL, swapping Room for DataStore. Or when the business logic is complex enough that it needs comprehensive unit testing independent of Android.

> **🧠 Think about it:** If your app has five screens and one developer, do you really need three layers, use cases, and mapper functions? What's the simplest architecture that still lets you test your business logic?

The real decision isn't "should I use Clean Architecture or not." It's "which parts of Clean Architecture does this project need." Maybe you need the repository pattern for testability but don't need use cases because your business logic is simple. Maybe you need domain models separate from DTOs but don't need a separate domain module. Take what you need, leave the rest. Architecture is a tool, not a religion.

## The Reframe — Architecture Is About Change, Not Structure

Here's what I think most developers misunderstand about Clean Architecture: **it's not about organizing files into folders. It's about making change cheap.**

Think of it like a house. You can rearrange the furniture in any room without knocking down walls. You can repaint the kitchen without touching the bedroom. Each room is independent. That's what Clean Architecture does for your code. The dependency rule exists so that changing your database doesn't break your UI. The domain layer exists so that business logic can be tested without booting an emulator. Use cases exist so that business operations can be composed and reused across features.

If your app never changes its data sources, never adds new features, and is maintained by one person — you probably don't need this. But in my experience, apps always change in ways you don't predict. The API gets redesigned. The product team wants offline support. A new feature needs the same business logic as an existing one but with a different UI. Clean Architecture makes those changes local instead of global — you modify one layer without breaking the others.

The architecture that matters isn't the one in the diagram. It's the one that lets your team ship features confidently without breaking existing functionality. Clean Architecture is one way to get there, and for apps with real complexity and real teams, I think it's the most practical approach we have.

Thank You!
