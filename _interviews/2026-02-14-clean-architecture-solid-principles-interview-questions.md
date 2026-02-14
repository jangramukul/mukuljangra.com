---
title: "Clean Architecture & SOLID Principles"
date: 2026-02-14
layout: interview
tags: [Architecture Round]
order: 2
sequence: 34
description: "Clean Architecture and SOLID come up in almost every architecture round."
---

## Clean Architecture & SOLID Principles — What Interviewers Really Ask

Clean Architecture and SOLID come up in almost every architecture round. Interviewers want to see that you understand why layers exist, how the dependency rule works, and can apply SOLID principles to real Android code — not just recite definitions.

### Core Questions (Beginner → Intermediate)

#### Q1: What is Clean Architecture?

Clean Architecture is a way of organizing code into layers where each layer has a clear responsibility and dependencies only point inward. The outer layers (UI, database, network) depend on inner layers (business logic), but inner layers never know about outer layers. This means your business logic doesn't depend on Android, Retrofit, Room, or any framework — making it testable and portable.

#### Q2: What are the three main layers in Clean Architecture for Android?

- **Presentation layer** — Activities, Fragments, Composables, ViewModels. Handles UI rendering and user interaction. Depends on the domain layer.
- **Domain layer** — Use cases, repository interfaces, domain models. Contains business logic. Has no Android dependencies — it's pure Kotlin. Depends on nothing.
- **Data layer** — Repository implementations, API services, DAOs, data sources. Handles actual data operations. Depends on the domain layer (implements its interfaces).

The domain layer sits in the middle and defines the contracts (interfaces) that the data layer implements. This is the dependency inversion principle in action.

#### Q3: What is the dependency rule?

The dependency rule says inner layers cannot reference outer layers. Domain cannot import anything from the data or presentation layer. If the domain layer needs data, it defines a repository interface, and the data layer provides the implementation. If you need to change your networking library from Retrofit to Ktor, only the data layer changes — the domain and presentation layers are untouched.

#### Q4: What is a Use Case (Interactor)?

A Use Case is a class in the domain layer that encapsulates a single piece of business logic. It takes input, coordinates with repositories, and returns output. Each use case has one job — `GetUserProfileUseCase`, `PlaceOrderUseCase`, `ValidateEmailUseCase`.

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

The `operator fun invoke` lets you call it like a function: `getUserProfile(userId)`. Use cases keep ViewModels thin because the ViewModel just calls the use case and updates state. If multiple ViewModels need the same business logic, they share the use case instead of duplicating the logic.

#### Q5: What is the Repository pattern in Clean Architecture?

The Repository is an interface defined in the domain layer and implemented in the data layer. It abstracts away where data comes from. The domain layer says "I need a UserRepository with a `getUser()` method" but doesn't know if the data comes from an API, a database, or a cache.

```kotlin
// Domain layer — interface
interface UserRepository {
    suspend fun getUser(userId: String): User
    fun observeUser(userId: String): Flow<User>
}

// Data layer — implementation
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

#### Q6: What is the difference between domain models, DTOs, and entities?

- **Domain model** — Pure Kotlin class that represents a business concept. Used in the domain and presentation layers. Contains only what the business logic needs.
- **DTO (Data Transfer Object)** — Represents the API response. Has serialization annotations like `@SerialName`. Lives in the data layer.
- **Entity** — Represents a database row. Has Room annotations like `@Entity`, `@ColumnInfo`. Lives in the data layer.

You map between them: `dto.toDomain()`, `entity.toDomain()`, `domain.toEntity()`. This seems like boilerplate, but it protects you. If the API response adds a field or the database schema changes, only the data layer's mapper changes. The domain model stays stable.

#### Q7: What is the Single Responsibility Principle?

A class, function, or module should handle only one responsibility. This promotes scalable, flexible, and testable code. If a class does too many things, a change in one area breaks another.

```kotlin
// Bad — ViewModel handles validation, network, and formatting
class OrderViewModel : ViewModel() {
    fun placeOrder(email: String, items: List<Item>) {
        if (!email.contains("@")) { /* validation logic */ }
        val total = items.sumOf { it.price * it.quantity } // business logic
        api.submitOrder(email, total) // network call
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

#### Q8: What is the Open-Closed Principle?

A class should be open for extension but closed for modification. You should be able to add new behavior without changing existing code. In Android, this often means using interfaces and sealed classes instead of modifying existing classes with `if/else` chains.

```kotlin
// Closed for modification — adding a new type means changing this function
fun calculateDiscount(type: String, amount: Double): Double {
    return when (type) {
        "premium" -> amount * 0.2
        "regular" -> amount * 0.1
        else -> 0.0
    }
}

// Open for extension — add new discount strategies without modifying existing code
interface DiscountStrategy {
    fun calculate(amount: Double): Double
}

class PremiumDiscount : DiscountStrategy {
    override fun calculate(amount: Double) = amount * 0.2
}

class RegularDiscount : DiscountStrategy {
    override fun calculate(amount: Double) = amount * 0.1
}
```

#### Q9: What is the Liskov Substitution Principle?

If you have a superclass and a subclass, the subclass should be usable anywhere the superclass is expected without breaking anything. The subclass should have access to all the properties and functions of the superclass and should perform all operations without requiring modifications.

A common violation in Android is when a subclass throws `UnsupportedOperationException` for a method it inherits. If a `ReadOnlyRepository` extends `Repository` but throws on `save()`, any code expecting a `Repository` will break when it gets a `ReadOnlyRepository`.

#### Q10: What is the Interface Segregation Principle?

We should use interfaces to expose only the required properties or methods to a class. Don't force a class to implement methods it doesn't need. Split large interfaces into smaller, focused ones.

```kotlin
// Bad — forces every user store to support deletion
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

A ViewModel that only reads users only depends on `UserReader`. It doesn't need to know that deletion or export exists.

### Deep Dive Questions (Advanced → Expert)

#### Q11: What is the Dependency Inversion Principle and how does it relate to Clean Architecture?

Dependency Inversion says high-level modules should not depend on low-level modules — both should depend on abstractions. In Android terms, your ViewModel (high-level) shouldn't directly depend on Retrofit or Room (low-level). Instead, both depend on a repository interface defined in the domain layer.

This is exactly what the dependency rule in Clean Architecture enforces. The domain layer defines `UserRepository` as an interface. The data layer implements it with Retrofit and Room. The presentation layer gets the interface injected, not the implementation. If you swap Retrofit for Ktor tomorrow, the ViewModel doesn't change — it only knows the interface.

Without dependency inversion, your ViewModel imports `RetrofitUserService`, and changing the network library means changing every ViewModel. With it, you change one class in the data layer and update the DI module.

#### Q12: What is the mapper pattern and why does Clean Architecture use it?

Mappers convert between data representations at layer boundaries. You write extension functions or mapper classes that convert DTOs to domain models, domain models to entities, and domain models to UI models.

```kotlin
// API response → Domain model
fun UserDto.toDomain() = User(
    id = this.userId,
    name = "${this.firstName} ${this.lastName}",
    email = this.emailAddress
)

// Domain model → Database entity
fun User.toEntity() = UserEntity(
    id = this.id,
    name = this.name,
    email = this.email,
    lastUpdated = System.currentTimeMillis()
)
```

This looks like unnecessary boilerplate until the API changes its field names or the database adds a column. Without mappers, that change ripples through every layer. With mappers, you update one function and everything else stays the same. Mappers also let you hide implementation details — the domain model doesn't need to know about `@SerialName` or `@ColumnInfo`.

#### Q13: Is the domain layer always necessary?

No. For simple screens that just fetch data and display it, a domain layer with a single use case that calls one repository method adds boilerplate without value. Google's official architecture guide says the domain layer is optional.

The domain layer earns its place when business logic is shared across multiple ViewModels, when business rules are complex enough to test independently, or when the mapping between data models and UI models involves real logic. If your use case is just `return repository.getUser(id)`, you can skip it and let the ViewModel call the repository directly. Add the layer when the complexity justifies it.

#### Q14: How do you structure packages in Clean Architecture for Android?

There are two common approaches:

**By layer** — top-level packages are `presentation`, `domain`, `data`. Each contains all features. This works for smaller apps but gets messy when the app grows because related code is spread across packages.

**By feature then layer** — top-level packages are features like `auth`, `profile`, `cart`. Each feature has its own `presentation`, `domain`, `data` sub-packages. This scales better because everything related to auth is in one place. Finding code is easier, and refactoring a feature doesn't touch other packages.

Most large Android apps use feature-based packaging because it maps to how teams work. One team owns `auth`, another owns `cart`. In a multi-module setup, each feature becomes its own Gradle module with its own layer packages inside.

#### Q15: How do you handle errors across layers in Clean Architecture?

Errors originate in the data layer (network failures, database errors) and need to reach the presentation layer for display. The cleanest approach is to use a `Result` type or sealed class that wraps success and failure cases.

```kotlin
// Domain layer — result wrapper
sealed class DataResult<out T> {
    data class Success<T>(val data: T) : DataResult<T>()
    data class Error(val message: String, val cause: Throwable? = null) : DataResult<Nothing>()
}

// Repository maps exceptions to domain errors
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

The data layer catches exceptions and wraps them in domain-level error types. The presentation layer maps these to UI states (error messages, retry buttons). Exceptions from Retrofit or Room never leak into the domain or presentation layers.

#### Q16: How do SOLID principles apply to a real Android ViewModel?

A well-written ViewModel follows several SOLID principles naturally. Single Responsibility — it manages UI state for one screen, nothing else. Dependency Inversion — it depends on repository interfaces, not implementations. Open-Closed — adding a new data source doesn't change the ViewModel, just the repository.

Where it breaks down is when ViewModels accumulate responsibilities. A `ProfileViewModel` that handles profile editing, avatar upload, password change, and notification settings violates Single Responsibility. Each of those should be its own ViewModel or use case. Same when a ViewModel directly calls `Retrofit` — that's a Dependency Inversion violation that makes the ViewModel impossible to unit test without mocking the HTTP client.

#### Q17: What is the difference between Clean Architecture and MVVM?

MVVM is a presentation-layer pattern — it defines how the View and ViewModel interact. Clean Architecture is a full-app architecture that defines all layers, their responsibilities, and the dependency direction. You use MVVM *inside* Clean Architecture's presentation layer.

Clean Architecture without MVVM is valid — you could use MVP or MVI in the presentation layer. MVVM without Clean Architecture is also valid — you can have a ViewModel call Retrofit directly without a domain layer. But combining them gives you both: clean separation across layers (Clean Architecture) and reactive UI updates (MVVM).

#### Q18: How do you handle data that needs to be shared across multiple screens?

Shared data should live in the repository or a shared state holder — not in a ViewModel. ViewModels are scoped to a screen or navigation graph, so sharing data between ViewModels through a ViewModel is fragile.

The repository can expose a `StateFlow` that multiple ViewModels collect. When one screen updates data through the repository, other screens observe the change automatically. For data scoped to a navigation graph (like a multi-step checkout flow), you can use a shared ViewModel scoped to the nav graph using `hiltNavGraphViewModels()` or `activityViewModels()`.

### Common Follow-ups

- How do you decide when a project needs Clean Architecture vs a simpler setup?
- Where do mappers live — in the domain layer or the data layer?
- How do you handle pagination in Clean Architecture — does the use case know about pages?
- What's the difference between a use case and a repository method?
- How do you test each layer independently in Clean Architecture?
- Can the presentation layer directly access the data layer, skipping domain?
- How does the dependency rule change when you move to multi-module architecture?
- What's the difference between an Entity in Clean Architecture and an Entity in Room?
