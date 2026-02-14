---
title: "Clean Architecture & SOLID Principles"
date: 2026-02-14
layout: interview
tags: [Architecture Round]
order: 2
sequence: 34
description: "Clean Architecture and SOLID come up in almost every architecture round."
---

## Clean Architecture & SOLID Principles

Clean Architecture and SOLID come up in almost every architecture round. You need to know why layers exist, how the dependency rule works, and how to apply SOLID to real Android code.

#### What is Clean Architecture?

Clean Architecture organizes code into layers where dependencies only point inward. The outer layers (UI, database, network) depend on inner layers (business logic), but inner layers never know about outer layers. This means my business logic doesn't depend on Android, Retrofit, Room, or any framework — making it testable and portable.

#### What are the three main layers in Clean Architecture for Android?

- **Presentation layer** — Activities, Fragments, Composables, ViewModels. Handles UI and user interaction. Depends on the domain layer.
- **Domain layer** — Use cases, repository interfaces, domain models. Pure Kotlin, no Android dependencies. Depends on nothing.
- **Data layer** — Repository implementations, API services, DAOs, data sources. Depends on the domain layer (implements its interfaces).

The domain layer sits in the middle and defines the contracts that the data layer implements. This is dependency inversion in action.

#### What are the SOLID principles?

- **S — Single Responsibility** — A class or function should handle only one responsibility. It promotes scalable, flexible, and testable code.
- **O — Open-Closed** — A class should be open for extension but closed for modification. Add new behavior through interfaces or inheritance, not by changing existing code.
- **L — Liskov Substitution** — If I have a superclass and a subclass, the subclass should have access to all properties and functions of the superclass. It should perform all operations without requiring modifications.
- **I — Interface Segregation** — I should use interfaces to expose only the required properties or methods to a class. Don't force a class to implement things it doesn't need.
- **D — Dependency Inversion** — High-level modules should not depend on low-level modules. Both should depend on abstractions.

#### What is the Single Responsibility Principle in practice?

A class that does too many things becomes fragile. A change in one area breaks another.

```kotlin
// Bad — ViewModel handles validation, business logic, and network
class OrderViewModel : ViewModel() {
    fun placeOrder(email: String, items: List<Item>) {
        if (!email.contains("@")) { /* validation */ }
        val total = items.sumOf { it.price * it.quantity }
        api.submitOrder(email, total)
    }
}

// Good — each concern in its own class
class ValidateEmailUseCase {
    operator fun invoke(email: String): Boolean = email.contains("@")
}

class CalculateTotalUseCase {
    operator fun invoke(items: List<Item>): Double =
        items.sumOf { it.price * it.quantity }
}
```

#### What is the dependency rule?

Inner layers cannot reference outer layers. Domain cannot import anything from data or presentation. If the domain layer needs data, it defines a repository interface, and the data layer provides the implementation. If I change my networking library from Retrofit to Ktor, only the data layer changes.

#### What is a Use Case?

A Use Case is a class in the domain layer that encapsulates a single piece of business logic. Each use case has one job — `GetUserProfileUseCase`, `PlaceOrderUseCase`, `ValidateEmailUseCase`.

```kotlin
class GetUserProfileUseCase(
    private val userRepository: UserRepository,
    private val postRepository: PostRepository
) {
    suspend operator fun invoke(userId: String): UserProfile {
        val user = userRepository.getUser(userId)
        val recentPosts = postRepository.getRecentPosts(userId, limit = 5)
        return UserProfile(user, recentPosts)
    }
}
```

The `operator fun invoke` lets me call it like a function: `getUserProfile(userId)`. Use cases keep ViewModels thin. If multiple ViewModels need the same business logic, they share the use case instead of duplicating it.

#### What is the Repository pattern in Clean Architecture?

The Repository is an interface defined in the domain layer and implemented in the data layer. It abstracts where data comes from. The domain layer says "I need a `getUser()` method" but doesn't care if the data comes from an API, database, or cache.

```kotlin
// Domain layer
interface UserRepository {
    suspend fun getUser(userId: String): User
    fun observeUser(userId: String): Flow<User>
}

// Data layer
class UserRepositoryImpl(
    private val api: UserApi,
    private val dao: UserDao
) : UserRepository {
    override suspend fun getUser(userId: String): User {
        val cached = dao.getUser(userId)
        if (cached != null) return cached.toDomain()
        val remote = api.fetchUser(userId)
        dao.insert(remote.toEntity())
        return remote.toDomain()
    }

    override fun observeUser(userId: String): Flow<User> {
        return dao.observeUser(userId).map { it.toDomain() }
    }
}
```

#### What is the difference between domain models, DTOs, and entities?

- **Domain model** — Pure Kotlin class representing a business concept. Contains only what the business logic needs.
- **DTO** — Represents the API response. Has serialization annotations like `@SerialName`. Lives in the data layer.
- **Entity** — Represents a database row. Has Room annotations like `@Entity`, `@ColumnInfo`. Lives in the data layer.

I map between them: `dto.toDomain()`, `entity.toDomain()`, `domain.toEntity()`. It looks like boilerplate, but if the API response changes or the database schema changes, only the data layer's mapper changes. The domain model stays stable.

#### What is the Dependency Inversion Principle and how does it relate to Clean Architecture?

My ViewModel (high-level) shouldn't directly depend on Retrofit or Room (low-level). Instead, both depend on a repository interface defined in the domain layer.

This is exactly what Clean Architecture's dependency rule enforces. The domain layer defines `UserRepository` as an interface. The data layer implements it. The presentation layer gets the interface injected, not the implementation. If I swap Retrofit for Ktor, the ViewModel doesn't change — it only knows the interface.

Without dependency inversion, my ViewModel imports `RetrofitUserService`, and changing the network library means changing every ViewModel. With it, I change one class in the data layer and update the DI module.

#### What is the difference between Clean Architecture and MVVM?

MVVM is a presentation-layer pattern — it defines how the View and ViewModel interact. Clean Architecture is a full-app architecture that defines all layers, their responsibilities, and the dependency direction. I use MVVM *inside* Clean Architecture's presentation layer.

Clean Architecture without MVVM is valid — I could use MVP or MVI in the presentation layer. MVVM without Clean Architecture is also valid — I can have a ViewModel call Retrofit directly without a domain layer. Combining them gives me both: clean separation across layers and reactive UI updates.

#### What is the Interface Segregation Principle in practice?

Don't force a class to implement methods it doesn't need. Split large interfaces into smaller, focused ones.

```kotlin
// Bad — forces every user store to support deletion and export
interface UserStore {
    fun getUser(id: String): User
    fun saveUser(user: User)
    fun deleteUser(id: String)
    fun exportUsers(): File
}

// Good — split by concern
interface UserReader {
    fun getUser(id: String): User
}

interface UserWriter {
    fun saveUser(user: User)
    fun deleteUser(id: String)
}
```

A ViewModel that only reads users depends on `UserReader`. It doesn't need to know that deletion or export exists.

#### Is the domain layer always necessary?

No. For simple screens that just fetch and display data, a use case that only calls one repository method adds boilerplate without value. Google's official architecture guide says the domain layer is optional.

It earns its place when business logic is shared across multiple ViewModels, when business rules are complex enough to test independently, or when mapping between data and UI models involves real logic. If my use case is just `return repository.getUser(id)`, I skip it and let the ViewModel call the repository directly.

#### How do you structure packages in Clean Architecture?

Two common approaches:

**By layer** — Top-level packages are `presentation`, `domain`, `data`. Works for smaller apps but gets messy as the app grows because related code is spread across packages.

**By feature then layer** — Top-level packages are features like `auth`, `profile`, `cart`. Each feature has its own `presentation`, `domain`, `data` sub-packages. This scales better because everything related to a feature is in one place.

Most large Android apps use feature-based packaging because it maps to how teams work. In a multi-module setup, each feature becomes its own Gradle module with layer packages inside.

#### What is the mapper pattern and why does Clean Architecture use it?

Mappers convert between data representations at layer boundaries — DTOs to domain models, domain models to entities, domain models to UI models.

```kotlin
fun UserDto.toDomain() = User(
    id = this.userId,
    name = "${this.firstName} ${this.lastName}",
    email = this.emailAddress
)

fun User.toEntity() = UserEntity(
    id = this.id,
    name = this.name,
    email = this.email,
    lastUpdated = System.currentTimeMillis()
)
```

Without mappers, an API field name change ripples through every layer. With mappers, I update one function. The domain model doesn't need to know about `@SerialName` or `@ColumnInfo`.

#### How do you handle errors across layers in Clean Architecture?

Errors start in the data layer and need to reach the presentation layer. I use a sealed class that wraps success and failure.

```kotlin
sealed class DataResult<out T> {
    data class Success<T>(val data: T) : DataResult<T>()
    data class Error(val message: String, val cause: Throwable? = null) : DataResult<Nothing>()
}

class OrderRepositoryImpl(private val api: OrderApi) : OrderRepository {
    override suspend fun placeOrder(cart: Cart): DataResult<Order> {
        return try {
            val response = api.submit(cart.toDto())
            DataResult.Success(response.toDomain())
        } catch (e: HttpException) {
            DataResult.Error("Server error: ${e.code()}", e)
        } catch (e: IOException) {
            DataResult.Error("Network unavailable", e)
        }
    }
}
```

The data layer catches exceptions and wraps them in domain-level error types. The presentation layer maps these to UI states. Exceptions from Retrofit or Room never leak into the domain or presentation layers.

#### How do SOLID principles apply to a real ViewModel?

A well-written ViewModel follows SOLID naturally. Single Responsibility — it manages UI state for one screen. Dependency Inversion — it depends on repository interfaces, not implementations. Open-Closed — adding a new data source doesn't change the ViewModel.

Where it breaks down is when ViewModels accumulate responsibilities. A `ProfileViewModel` that handles editing, avatar upload, password change, and notification settings violates Single Responsibility. Each should be its own use case. Same when a ViewModel directly calls `Retrofit` — that's a Dependency Inversion violation that makes unit testing impossible without mocking the HTTP client.

#### How do you handle data shared across multiple screens?

Shared data should live in the repository or a shared state holder — not in a ViewModel. ViewModels are scoped to a screen or navigation graph, so sharing data between ViewModels is fragile.

The repository can expose a `StateFlow` that multiple ViewModels collect. When one screen updates data through the repository, other screens observe the change automatically. For data scoped to a navigation graph (like a multi-step checkout), I can use a shared ViewModel scoped to the nav graph with `hiltNavGraphViewModels()`.

#### What is the Open-Closed Principle in practice?

I should be able to add new behavior without changing existing code. In Android, this means using interfaces instead of `if/else` chains.

```kotlin
// Closed — adding a new type means changing this function
fun calculateDiscount(type: String, amount: Double): Double {
    return when (type) {
        "premium" -> amount * 0.2
        "regular" -> amount * 0.1
        else -> 0.0
    }
}

// Open — add new strategies without modifying existing code
interface DiscountStrategy {
    fun calculate(amount: Double): Double
}

class PremiumDiscount : DiscountStrategy {
    override fun calculate(amount: Double) = amount * 0.2
}
```

#### What is the Liskov Substitution Principle violation in Android?

A common violation is when a subclass throws `UnsupportedOperationException` for a method it inherits. If a `ReadOnlyRepository` extends `Repository` but throws on `save()`, any code expecting a `Repository` will break when it gets a `ReadOnlyRepository`. The fix is to split the interface so the read-only version doesn't promise write operations it can't fulfill.

### Common Follow-ups

- How do you decide when a project needs Clean Architecture vs a simpler setup?
- Where do mappers live — in the domain layer or the data layer?
- How do you handle pagination in Clean Architecture — does the use case know about pages?
- What's the difference between a use case and a repository method?
- How do you test each layer independently in Clean Architecture?
- Can the presentation layer directly access the data layer, skipping domain?
- How does the dependency rule change when you move to multi-module architecture?
- What's the difference between an Entity in Clean Architecture and an Entity in Room?
