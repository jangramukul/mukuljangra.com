---
title: What's the main purpose of DI?
layout: post
categories: post
tags:
  - Android
  - Architecture
---

Imagine you just moved into a new apartment. You need a coffee every morning, so you buy a coffee machine, a grinder, beans, filters, and a milk frother. You set everything up on the counter, and it works. But now imagine every single room in your apartment had to do the same thing — the bedroom has its own coffee machine, the living room has its own coffee machine, even the bathroom (don't ask). Each room is independently sourcing, building, and maintaining its own coffee setup. That's insane, right?

That's exactly what my early Android code looked like. I wrote ViewModels that created their own repository instances, repositories that created their own Retrofit services, and services that created their own OkHttpClients. Every class was responsible for building its own dependencies. The code worked, but testing was impossible without running a real server, swapping implementations meant touching dozens of files, and adding a new feature meant tracing through a web of constructor calls to figure out what depended on what. I didn't know it at the time, but I was experiencing the exact problem that Dependency Injection was designed to solve.

Here's the thing about Dependency Injection — it has a complicated reputation it doesn't deserve. At its core, it means **a class receives its dependencies from the outside instead of creating them internally.** That's it. Seriously. The class doesn't know how to build a `UserRepository` — it just declares that it needs one, and something else provides it. Going back to our coffee analogy: instead of every room having its own coffee machine, there's one kitchen that makes the coffee, and each room just says "I need coffee" and gets it delivered.

This one shift — from "I create what I need" to "I declare what I need" — has cascading effects on testability, flexibility, and maintainability.

## The Problem Without DI

When a class creates its own dependencies, three things go wrong. First, you can't test the class in isolation because you can't substitute a fake dependency. If your `OrderViewModel` creates a `RealOrderRepository` that calls a real API, your unit tests hit the network. Second, swapping implementations requires modifying the class itself. Want to switch from Retrofit to Ktor? You touch every class that creates a Retrofit instance. Third, the dependency graph becomes implicit — there's no single place to see what depends on what.

Look at this ViewModel and see if it makes you uncomfortable:

```kotlin
// Without DI — the ViewModel creates everything it needs
class OrderViewModel : ViewModel() {

    // Tightly coupled — can't swap these for testing
    private val httpClient = OkHttpClient.Builder().build()
    private val retrofit = Retrofit.Builder()
        .baseUrl("https://api.myapp.com")
        .client(httpClient)
        .build()
    private val api = retrofit.create(OrderApi::class.java)
    private val repository = OrderRepository(api)

    fun loadOrders() {
        viewModelScope.launch {
            val orders = repository.getOrders()
            _uiState.value = UiState.Success(orders)
        }
    }
}
```

This ViewModel is impossible to unit test without hitting the real API. But it gets worse — every `OrderViewModel` creates its own `OkHttpClient`, `Retrofit`, and `OrderApi` instance. In a real app, you want a single shared `OkHttpClient` with connection pooling, not one per screen. It's like every room in the apartment buying its own Wi-Fi router instead of sharing one.

> **🧠 Think about it:** If you wanted to write a unit test for this ViewModel, what would you have to do? You can't swap out the repository for a fake one. You can't control what the API returns. Your only option is to run a real server. For a *unit* test. That's not great.

## Manual DI — The Simplest Starting Point

Before reaching for Dagger or Hilt, it's worth understanding manual DI. Constructor injection — passing dependencies as constructor parameters — is DI in its purest form. No framework, no code generation, no magic. You just... pass things in.

```kotlin
// With manual DI — dependencies are passed in
class OrderViewModel(
    private val repository: OrderRepository
) : ViewModel() {

    fun loadOrders() {
        viewModelScope.launch {
            val orders = repository.getOrders()
            _uiState.value = UiState.Success(orders)
        }
    }
}

// A simple container that wires everything together
class AppContainer(private val context: Context) {
    private val httpClient = OkHttpClient.Builder()
        .addInterceptor(AuthInterceptor(context))
        .build()

    private val retrofit = Retrofit.Builder()
        .baseUrl("https://api.myapp.com")
        .client(httpClient)
        .addConverterFactory(MoshiConverterFactory.create())
        .build()

    private val orderApi = retrofit.create(OrderApi::class.java)
    val orderRepository = OrderRepository(orderApi)
}
```

See what happened there? `OrderViewModel` doesn't know or care how `OrderRepository` is built. It doesn't know about OkHttp, Retrofit, or Moshi. It just says "give me a repository" and does its job. In tests, you pass a `FakeOrderRepository`. In production, the `AppContainer` provides the real one. The ViewModel went from untestable to trivially testable with one change — moving dependency construction outside the class.

Now here's where it gets interesting. Manual DI works well for small apps with a handful of dependencies. But as your app grows to 50+ classes with complex dependency graphs, manually wiring everything becomes tedious and error-prone. You have to manage lifetimes (should this be a singleton or a new instance?), handle scoping (should the payment flow share a single `PaymentManager` instance?), and remember the construction order. That's where DI frameworks come in.

## Service Locator vs Dependency Injection

Before talking about Dagger and Hilt, it's worth distinguishing DI from another pattern it's often confused with: the Service Locator. Both provide dependencies from a central place, but they work in fundamentally different directions.

Think of it this way. A **Service Locator** is like a vending machine — the class walks up to it and says "give me a repository." The class actively reaches in and grabs what it needs. **Dependency Injection** is more like room service — the class puts a sign on the door saying "I need a repository," and someone delivers it. The class just sits there and receives.

Sounds like a small difference? It's not.

```kotlin
// Service Locator — the class reaches INTO the container
class OrderViewModel : ViewModel() {
    private val repository = ServiceLocator.get<OrderRepository>()
}

// Dependency Injection — the class RECEIVES from outside
class OrderViewModel(
    private val repository: OrderRepository  // pushed in
) : ViewModel()
```

The Service Locator pattern has two problems. First, dependencies are hidden — looking at the class's constructor doesn't tell you what it needs. You have to read the body to discover that it depends on `OrderRepository`. Second, testing requires setting up the global locator with test fakes before every test and cleaning up after, which creates shared mutable state between tests. Constructor injection makes dependencies explicit and testing straightforward.

Google's official Android architecture guidance recommends constructor injection over Service Locator for these reasons.

> **⚡ Quick check:** If you see a class with an empty constructor but it still somehow uses a repository, a database, and an API client internally — what pattern is it probably using? (Hint: vending machine, not room service.)

## Dagger and Hilt — Compile-Time DI

So manual DI gets painful at scale, and Service Locator has its own problems. What do we actually use in production?

Dagger is the most widely used DI framework in Android. It generates all the wiring code at compile time through annotation processing, so there's no runtime reflection and no performance overhead. The tradeoff is that Dagger's API surface is large and its learning curve is steep. I've seen developers spend more time debugging Dagger errors than writing actual features. I know, I know — it gets better once you understand it.

Hilt is Google's opinionated layer on top of Dagger that provides standard component scopes for Android (Application, Activity, Fragment, ViewModel). It eliminates most of the boilerplate that made Dagger hard to set up and makes the common patterns easy. Think of Hilt as Dagger with training wheels that you never actually need to take off.

```kotlin
@HiltAndroidApp
class MyApplication : Application()

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient {
        return OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .build()
    }

    @Provides
    @Singleton
    fun provideOrderApi(client: OkHttpClient): OrderApi {
        return Retrofit.Builder()
            .baseUrl("https://api.myapp.com")
            .client(client)
            .addConverterFactory(MoshiConverterFactory.create())
            .build()
            .create(OrderApi::class.java)
    }
}

// Repository uses constructor injection — no annotations on the class
class OrderRepository @Inject constructor(
    private val orderApi: OrderApi,
    private val orderDao: OrderDao
) {
    suspend fun getOrders(): List<Order> {
        return try {
            val remote = orderApi.fetchOrders()
            orderDao.insertAll(remote.map { it.toEntity() })
            orderDao.getAllOrders().map { it.toDomain() }
        } catch (e: IOException) {
            orderDao.getAllOrders().map { it.toDomain() }
        }
    }
}

// ViewModel — Hilt provides the dependencies automatically
@HiltViewModel
class OrderViewModel @Inject constructor(
    private val repository: OrderRepository
) : ViewModel() {

    val orders = flow {
        emit(UiState.Loading)
        try {
            emit(UiState.Success(repository.getOrders()))
        } catch (e: Exception) {
            emit(UiState.Error(e.message ?: "Unknown error"))
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), UiState.Loading)
}
```

Notice how the `OrderViewModel` looks almost identical to our manual DI version. It still just declares "I need an `OrderRepository`" in its constructor. The difference is that Hilt figures out how to build that repository — and everything the repository needs — automatically at compile time.

The `@Singleton` scope means one instance for the entire application lifetime. `@InstallIn(SingletonComponent::class)` tells Hilt which component owns these bindings. For Activity-scoped or Fragment-scoped dependencies, you'd use `ActivityComponent` or `FragmentComponent`. Hilt creates and destroys instances according to these scopes automatically.

## When to Use DI — And When It's Overkill

DI isn't free. Dagger/Hilt add build time (the annotation processing generates code for every module), increase the learning curve for new team members, and add complexity to your project setup. For a small app with 5-10 classes, manual constructor injection is simpler, faster to build, and easier to understand.

I reach for Hilt when: the app has more than two or three feature modules, the dependency graph has cross-cutting concerns (logging, analytics, auth tokens shared across features), or the team needs standardized patterns that new developers can follow without understanding the full graph.

I stick with manual DI when: the app is small, the team is one or two people, or when I'm building a library (libraries shouldn't force a DI framework on their consumers).

> **🔥 Real talk:** I've worked on projects where someone introduced Dagger into a 10-screen app with a flat dependency graph. The Dagger modules ended up being more complex than the actual business logic. Don't reach for a framework just because it's what big apps use. Let the pain of manual wiring be the signal that you need one.

## The Reframe — DI Is About Boundaries, Not Frameworks

Here's what I think most developers get wrong about DI: **they focus on the framework instead of the principle.** Dagger, Hilt, Koin, manual injection — these are implementation details. The real value of DI is that it forces you to define clear boundaries between components. When a class declares its dependencies in its constructor, it's documenting its contract with the rest of the system. When you wire dependencies in a module, you're explicitly defining the shape of your application's dependency graph.

The best DI code I've worked with didn't feel like "DI code" at all. It was just classes with clean constructors, interfaces that defined contracts, and one place (a module or a container) that wired everything together. The worst DI code I've seen had so many Dagger annotations, scopes, qualifiers, and multi-bindings that the dependency graph was harder to understand than the business logic it was supposed to simplify.

> **💡 The "aha" moment:** DI isn't really about injection at all. It's about making every class honest about what it needs. An honest constructor is a testable constructor. A testable constructor is a flexible constructor. And a flexible constructor means you can change your app without a cascade of rewrites.

Start with constructor injection. Move to Hilt when manual wiring gets painful. And remember that the goal isn't to use a DI framework — it's to write code where every class is testable, every dependency is explicit, and swapping implementations is trivial.

Thanks for reading!
