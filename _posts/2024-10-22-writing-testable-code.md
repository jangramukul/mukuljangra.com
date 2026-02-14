---
title: How To Write Testable Code?
layout: post
categories: post
tags:
  - Android
  - Kotlin
---

In the early days of my career, I had no idea about testing. I'd write code, manually check if it worked, ship it, and then wonder why production kept breaking. I remember one specific incident where a login flow silently failed for a subset of users because I'd hardcoded a dependency deep inside a ViewModel — no tests, no safety net, just a 2 AM hotfix. That experience forced me to take testing seriously. But here's the thing I learned pretty quickly: the problem was never about picking the right testing framework. The problem was that my code was fundamentally untestable.

After years of writing Android apps, I've realized that testable code and clean code are basically the same thing. When you structure code so it's easy to test, you naturally end up with code that's easier to read, easier to change, and way less likely to break in production. The principles I'm going to walk through aren't theoretical — they're patterns I use on every project. Some of them seem obvious in retrospect, but I've seen even experienced engineers get them wrong.

## Constructor Injection Over Everything

IMO, **constructor injection** is the single most impactful thing you can do for testability. The idea is dead simple — every dependency a class needs should be passed through its constructor. No reaching into singletons, no late-initialized fields, no invisible setup. When you look at a constructor, you should see the complete list of things that class depends on.

Here's why this matters so much for testing: if all dependencies live in the constructor, you can swap any of them with a test double. There's no hidden state, no surprise initialization order, and no "oh, you also need to call `init()` first" nonsense. Compare these two approaches.

```kotlin
// Hard to test — hidden dependency
class PaymentViewModel : ViewModel() {
    private val repository = PaymentRepositoryImpl(
        api = RetrofitClient.paymentApi,
        cache = RoomDatabase.getInstance().paymentDao()
    )

    fun processPayment(amount: Double) {
        viewModelScope.launch {
            repository.charge(amount)
        }
    }
}

// Easy to test — explicit constructor injection
class PaymentViewModel(
    private val repository: PaymentRepository
) : ViewModel() {

    fun processPayment(amount: Double) {
        viewModelScope.launch {
            repository.charge(amount)
        }
    }
}
```

The first version is a nightmare to test. You'd need a real Retrofit client, a real Room database, and probably an emulator running. The second version? You just pass in a fake. In production, Hilt or Koin provides the real `PaymentRepository`. In tests, you hand in whatever you want. That separation is everything.

**Field injection** (using `@Inject lateinit var`) works in Android components like Activities and Fragments where you don't control the constructor. But for ViewModels, repositories, and use cases — always prefer constructor injection. It makes dependencies explicit and the class honest about what it needs.

## Interface Abstraction — But Not Always

Using **interfaces** to abstract dependencies is one of the basic requirements for testable code. When your ViewModel depends on a `LoginRepository` interface instead of `LoginRepositoryImpl`, you can swap in any implementation during tests. The interface acts as a contract — your test double just needs to fulfill that contract.

```kotlin
interface LoginRepository {
    suspend fun signIn(email: String, password: String): AuthResult
}

class LoginRepositoryImpl(
    private val networkSource: LoginNetworkDataSource,
    private val tokenStore: TokenStore
) : LoginRepository {
    override suspend fun signIn(email: String, password: String): AuthResult {
        val response = networkSource.authenticate(email, password)
        if (response.isSuccessful) {
            tokenStore.save(response.token)
        }
        return response.toAuthResult()
    }
}
```

But here's where I see people go overboard — creating interfaces for absolutely everything, even classes that will only ever have one implementation. If your `DateFormatter` utility has a single implementation and no test double would ever behave differently, the interface just adds noise. I follow a simple rule: **create an interface when the class has external side effects** (network, database, shared preferences, file system) or when you genuinely need polymorphism. Pure logic classes that just transform data? Skip the interface. You can test them directly.

The exception is when you're working in a large team with modular architecture. In that case, interfaces at module boundaries make sense even for single implementations, because they define API contracts between modules. But for classes internal to a module, be pragmatic about it.

## Pure Functions — Trivially Testable

A **pure function** takes inputs, returns an output, and does nothing else. No network calls, no database writes, no mutating shared state. Pure functions are the easiest thing in the world to test because they're completely deterministic — same input, same output, every single time.

The real skill is **extracting pure logic from impure contexts**. Most business logic is actually pure — it's just trapped inside classes that also do I/O. When I look at a ViewModel or repository method that's hard to test, I try to split it into a pure computation part and an impure I/O part.

```kotlin
// Pure function — trivially testable
fun calculateOrderTotal(
    items: List<CartItem>,
    discountPercent: Double,
    taxRate: Double
): OrderSummary {
    val subtotal = items.sumOf { it.price * it.quantity }
    val discount = subtotal * (discountPercent / 100)
    val taxable = subtotal - discount
    val tax = taxable * taxRate
    return OrderSummary(
        subtotal = subtotal,
        discount = discount,
        tax = tax,
        total = taxable + tax
    )
}

// Impure wrapper that uses the pure function
class OrderRepository(private val api: OrderApi) {
    suspend fun placeOrder(cartId: String): OrderResult {
        val cart = api.getCart(cartId)
        val summary = calculateOrderTotal(
            items = cart.items,
            discountPercent = cart.appliedDiscount,
            taxRate = cart.regionTaxRate
        )
        return api.submitOrder(cartId, summary)
    }
}
```

Testing `calculateOrderTotal` requires zero mocks, zero setup — just call it with values and assert the output. The complex pricing logic, edge cases around discounts, tax rounding — all of it testable with simple unit tests. The impure `placeOrder` method is thin and mostly just orchestration, which is far easier to verify.

## Avoiding Statics and Singletons

**Static methods** and **`object` singletons** are testability killers. When your code calls `NetworkClient.getInstance().fetch(url)`, you can't swap that with a fake in tests. The dependency is invisible and hardwired. I've seen production codebases where half the debugging time was spent trying to figure out which singleton had stale state from a previous test run.

The solution is straightforward — inject instead of reaching. If a class needs a network client, take it as a constructor parameter. If it needs a logger, inject it. If it needs a clock (and I'd argue many classes do), pass in a `Clock` interface instead of calling `System.currentTimeMillis()` directly.

```kotlin
// Hard to test — static singleton access
class SessionManager {
    fun isSessionValid(): Boolean {
        val lastActivity = PreferenceStore.getLong("last_activity")
        val now = System.currentTimeMillis()
        return (now - lastActivity) < SESSION_TIMEOUT
    }
}

// Testable — dependencies injected
class SessionManager(
    private val preferenceStore: PreferenceStore,
    private val clock: Clock
) {
    fun isSessionValid(): Boolean {
        val lastActivity = preferenceStore.getLong("last_activity")
        val now = clock.currentTimeMillis()
        return (now - lastActivity) < SESSION_TIMEOUT
    }
}
```

With the second version, you can inject a `FakeClock` that returns whatever time you want. You can verify session expiration logic without waiting real seconds. You can inject a `FakePreferenceStore` backed by a simple `HashMap`. The test becomes fast, deterministic, and isolated.

## Test Doubles — Mock vs Fake vs Stub

This is something I wish someone had explained to me clearly early on. There are three main kinds of **test doubles**, and picking the right one matters.

A **stub** returns hardcoded values. It doesn't verify anything — it just provides canned responses so your system under test can run. A **mock** is a stub that also records interactions and lets you verify they happened. A **fake** is a lightweight working implementation — it actually executes logic, just with in-memory data instead of real I/O.

I prefer **hand-written fakes** over Mockito mocks for most cases. Here's why: fakes behave like real implementations. If your `FakeUserRepository` stores users in a `MutableList`, your test exercises real insertion, retrieval, and error paths. A Mockito mock just returns whatever you tell it to — it doesn't catch bugs in how you call the dependency.

```kotlin
class FakeUserRepository : UserRepository {
    private val users = mutableListOf<User>()
    var shouldFail = false

    override suspend fun getUser(id: String): User? {
        if (shouldFail) throw IOException("Network error")
        return users.find { it.id == id }
    }

    override suspend fun saveUser(user: User) {
        if (shouldFail) throw IOException("Network error")
        users.removeAll { it.id == user.id }
        users.add(user)
    }

    fun addUser(user: User) { users.add(user) }
}
```

This fake is reusable across every test that needs a `UserRepository`. You can simulate failures by flipping `shouldFail`, pre-populate data with `addUser`, and the behavior is predictable. Compare that with Mockito where every test needs a `whenever(repo.getUser(any())).thenReturn(...)` setup that's fragile and tells you nothing about whether your interaction patterns are correct.

That said, Mockito still has its place. For verifying that a specific method was called (like analytics tracking or logging), mocks are perfect. Use **stubs** for simple value providers like config or feature flags, **fakes** for components with state and behavior, and **mocks** only when you need to verify interactions.

## Testing ViewModels With Turbine

Testing a **ViewModel** that exposes `StateFlow` used to be painful — collecting from flows in tests meant wrestling with coroutine timing. Then **Turbine** came along and made it straightforward. Combined with a `MainDispatcherRule` to replace `Dispatchers.Main` in tests, ViewModel testing becomes genuinely pleasant.

```kotlin
class MainDispatcherRule(
    private val dispatcher: TestDispatcher = UnconfinedTestDispatcher()
) : TestWatcher() {
    override fun starting(description: Description) {
        Dispatchers.setMain(dispatcher)
    }
    override fun finished(description: Description) {
        Dispatchers.resetMain()
    }
}

class LoginViewModelTest {
    @get:Rule val mainDispatcherRule = MainDispatcherRule()

    private val fakeRepository = FakeLoginRepository()
    private val viewModel = LoginViewModel(repository = fakeRepository)

    @Test
    fun `successful login updates state to authenticated`() = runTest {
        viewModel.uiState.test {
            assertEquals(LoginUiState.Idle, awaitItem())
            viewModel.signIn("user@test.com", "password123")
            assertEquals(LoginUiState.Loading, awaitItem())
            assertEquals(LoginUiState.Authenticated("user@test.com"), awaitItem())
        }
    }

    @Test
    fun `failed login updates state to error`() = runTest {
        fakeRepository.shouldFail = true
        viewModel.uiState.test {
            skipItems(1) // skip Idle
            viewModel.signIn("user@test.com", "wrong")
            assertEquals(LoginUiState.Loading, awaitItem())
            assertTrue(awaitItem() is LoginUiState.Error)
        }
    }
}
```

The **`MainDispatcherRule`** is essential because `Dispatchers.Main` doesn't exist in unit tests — it's tied to Android's main looper. The rule swaps it with a `TestDispatcher` so coroutines launched in `viewModelScope` execute predictably. Turbine's `test` block gives you `awaitItem()` to collect emissions one by one, which is way more readable than `take(3).toList()` approaches. You can also use `StandardTestDispatcher` instead of `UnconfinedTestDispatcher` if you need explicit control over coroutine execution order via `advanceUntilIdle()`.

## Clean Architecture Layers and Testability

Here's the reframe moment for me: **each layer in clean architecture exists partly to make the layer above it testable**. The repository abstracts data sources so the use case doesn't know about Retrofit or Room. The use case encapsulates business logic so the ViewModel doesn't carry decision-making code. Each boundary is a seam where you can insert a test double.

### Use Case Testing

Use cases are the purest layer to test. They take repository interfaces as dependencies and contain business logic with no Android framework code.

```kotlin
class GetActiveSubscriptionsUseCase(
    private val subscriptionRepo: SubscriptionRepository,
    private val clock: Clock
) {
    suspend operator fun invoke(userId: String): List<Subscription> {
        val all = subscriptionRepo.getSubscriptions(userId)
        val now = clock.currentTimeMillis()
        return all.filter { it.expiresAt > now && it.status == Status.ACTIVE }
    }
}
```

Testing this is a matter of injecting a fake repo with known subscriptions and a fake clock with a fixed time. No coroutine complexity, no framework dependencies — just input and output.

### Repository Pattern Testing

Repositories are where I/O lives, so testing them means verifying the orchestration between data sources. Should the repository hit the cache first and then the network? Does it store network responses locally? A well-structured repository with injected data sources is straightforward to test with fakes.

The pattern I follow: the repository depends on interface-typed data sources (both `LocalDataSource` and `RemoteDataSource`), both injected via constructor. In tests, I provide fake implementations and assert that the repository coordinates them correctly — checking cache on reads, writing through on saves, handling errors from either source gracefully.

The broader point is this: if a class is hard to test, it's a design smell. Every time I struggle to write a test, the answer has never been "find a better mocking library." The answer is always "restructure the code so the dependencies are explicit and the logic is separated from the I/O." Testable code isn't a nice-to-have — it's the natural outcome of writing clean, well-structured code. Once that clicked for me, testing stopped being a chore and started being the thing that gives me confidence to ship.

And here we are done!
Thanks for reading!
