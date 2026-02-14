---
title: Design Patterns Guide in Kotlin
layout: post
categories: post
tags:
  - Kotlin
  - Architecture
  
---

A while back I was reviewing a pull request on a fairly mature Android project, and something bugged me. Not a single bug, but a pattern of bugs. A god-object ViewModel doing everything. Manual object creation scattered like confetti. Third-party SDK calls welded directly into business logic, making tests basically impossible. Every feature was solving the same structural problems in different ways, and none of them were solving them well.

Sound familiar?

Here's what I realized: the codebase didn't have a patterns problem in the academic sense. It had a "nobody agreed on how to build things" problem. And that's exactly what design patterns are for — not as textbook exercises, but as shared solutions to recurring structural headaches. Think of patterns like recipes in a kitchen. You don't need a recipe for boiling water. But when you're coordinating five dishes for dinner and everything needs to land at the same time? A recipe saves you from chaos.

Kotlin makes many of these patterns far more expressive than Java ever did. Some patterns that required 50+ lines of boilerplate in Java collapse into a few lines of idiomatic Kotlin. Others become so natural that you're already using them without realizing it. Here's a breakdown of the patterns I find most useful in real Android codebases, with implementations you can actually use.

## Creational Patterns

### Singleton — Kotlin's `object` Keyword

Kotlin's `object` keyword gives you a **thread-safe singleton** for free. Under the hood, the compiler generates a class with a private constructor and a static `INSTANCE` field initialized in a static block — the same pattern you'd write manually in Java but without the boilerplate. This is safe because the JVM guarantees that static initializers run exactly once, in a thread-safe manner.

One keyword. No double-checked locking. No `volatile`. Done.

```kotlin
object AnalyticsTracker {
    private val events = mutableListOf<AnalyticsEvent>()

    fun track(event: AnalyticsEvent) {
        events.add(event)
        // flush to remote service
    }

    fun getEventCount(): Int = events.size
}

// Usage anywhere in the app
AnalyticsTracker.track(AnalyticsEvent.ScreenView("HomeScreen"))
```

Here's the thing — while `object` is convenient, I'd argue you should almost never use it directly for anything that touches the network, database, or shared state. The problem is testability. You can't mock an `object` easily, and you can't swap it for a fake in tests. It's like having a light switch hardwired into the wall with no way to flip it off — fine until you need to test what happens in the dark.

A **companion object factory** is a better middle ground when you need a singleton-like access pattern but still want testability.

```kotlin
class UserRepository private constructor(
    private val api: UserApi,
    private val cache: UserCache
) {
    companion object {
        @Volatile
        private var instance: UserRepository? = null

        fun getInstance(api: UserApi, cache: UserCache): UserRepository {
            return instance ?: synchronized(this) {
                instance ?: UserRepository(api, cache).also { instance = it }
            }
        }
    }

    suspend fun getUser(id: String): User {
        return cache.get(id) ?: api.fetchUser(id).also { cache.put(id, it) }
    }
}
```

IMO, in any modern Android project using Hilt or Koin, you should let the DI framework handle singleton scoping with `@Singleton` instead of managing it yourself. The companion object factory approach is really for pre-DI codebases or library code where you can't assume a DI framework exists.

> **🔥 Real talk:** I've seen teams spend hours debugging race conditions in hand-rolled singleton implementations. The double-checked locking dance, the `@Volatile` annotations, the synchronized blocks — it's all ceremony that Hilt's `@Singleton` eliminates with a single annotation. If you're still writing companion object singletons in a project that already has Hilt, stop. You're solving a solved problem.

### Factory — Sealed Class Factories

The **Factory pattern** shines in Android when you need to create different implementations based on runtime conditions. Think of it like a restaurant kitchen — the customer orders "pasta," but the kitchen decides whether that's spaghetti, fettuccine, or penne based on what's available. The customer doesn't care how it's made. They just want pasta.

Kotlin's sealed classes make this particularly clean because the compiler enforces exhaustive `when` expressions — you literally cannot forget to handle a case. Miss one? The compiler yells at you. That's your safety net.

```kotlin
sealed class ApiRepository {
    abstract suspend fun fetchProducts(): List<Product>

    class Production(private val api: ProductApi) : ApiRepository() {
        override suspend fun fetchProducts(): List<Product> {
            return api.getProducts().map { it.toDomain() }
        }
    }

    class Staging(private val api: ProductApi) : ApiRepository() {
        override suspend fun fetchProducts(): List<Product> {
            return api.getProducts().map { it.toDomain() }
                .also { Log.d("Staging", "Fetched ${it.size} products") }
        }
    }

    class Mock : ApiRepository() {
        override suspend fun fetchProducts(): List<Product> {
            return listOf(Product("test-1", "Mock Product", 9.99))
        }
    }

    companion object {
        fun create(buildConfig: BuildConfig, api: ProductApi): ApiRepository {
            return when {
                buildConfig.isDebug && buildConfig.useMocks -> Mock()
                buildConfig.isDebug -> Staging(api)
                else -> Production(api)
            }
        }
    }
}
```

See what's happening? The calling code just says `ApiRepository.create(buildConfig, api)` and gets the right implementation. Debug build with mocks enabled? You get `Mock()`. Release build? `Production(api)`. The caller never needs to know which concrete class it got back.

Where this really pays off is **ViewModel creation** with `ViewModelProvider.Factory`. Before Hilt's `@HiltViewModel` simplified things, you'd write factories like this — and you still need them when your ViewModel has constructor parameters that don't come from Hilt.

```kotlin
class SearchViewModel(
    private val searchRepository: SearchRepository,
    private val analyticsTracker: AnalyticsTracker
) : ViewModel() {

    class Factory(
        private val searchRepository: SearchRepository,
        private val analyticsTracker: AnalyticsTracker
    ) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            return SearchViewModel(searchRepository, analyticsTracker) as T
        }
    }
}

// In Fragment
val viewModel: SearchViewModel by viewModels {
    SearchViewModel.Factory(searchRepository, analyticsTracker)
}
```

### Builder — When Kotlin Makes It (Mostly) Unnecessary

Here's an honest take — the traditional Java-style Builder pattern is largely unnecessary in Kotlin. Named parameters and default values solve the same problem with less code. Remember those Java builders with 8 optional fields, a `build()` method, and a fluent API that took 40 lines to set up? In Kotlin, that collapses into a single data class constructor.

```kotlin
// Instead of a Builder, just use named params with defaults
data class NotificationConfig(
    val title: String,
    val body: String,
    val channelId: String = "default",
    val priority: Int = NotificationCompat.PRIORITY_DEFAULT,
    val autoCancel: Boolean = true,
    val smallIcon: Int = R.drawable.ic_notification,
    val color: Int = Color.BLUE
)

// Clean call site — only specify what you need
val config = NotificationConfig(
    title = "New Message",
    body = "You have 3 unread messages",
    priority = NotificationCompat.PRIORITY_HIGH
)
```

You only specify what you care about, and the rest gets sensible defaults. That's the Builder pattern's goal — optional configuration — achieved without a single `.set()` call.

But builders aren't completely dead in Kotlin. **DSL-style builders** are genuinely useful when you're constructing nested or hierarchical structures. Think of it this way: named parameters work great for flat objects (a notification with 7 fields). But what about building something with layers — like a network client with interceptors, timeouts, and converters? That's where Kotlin's `@DslMarker` and lambda-with-receiver pattern come in.

```kotlin
@DslMarker
annotation class NetworkDsl

@NetworkDsl
class RetrofitClientBuilder {
    var baseUrl: String = ""
    var connectTimeout: Long = 30_000
    var readTimeout: Long = 30_000
    private val interceptors = mutableListOf<Interceptor>()

    fun interceptor(block: () -> Interceptor) {
        interceptors.add(block())
    }

    fun build(): Retrofit {
        val client = OkHttpClient.Builder()
            .connectTimeout(connectTimeout, TimeUnit.MILLISECONDS)
            .readTimeout(readTimeout, TimeUnit.MILLISECONDS)
            .apply { interceptors.forEach { addInterceptor(it) } }
            .build()

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }
}

fun retrofitClient(block: RetrofitClientBuilder.() -> Unit): Retrofit {
    return RetrofitClientBuilder().apply(block).build()
}

// Usage
val retrofit = retrofitClient {
    baseUrl = "https://api.myapp.com/"
    connectTimeout = 15_000
    interceptor { HttpLoggingInterceptor() }
    interceptor { AuthInterceptor(tokenProvider) }
}
```

So here's the rule of thumb: use DSL builders when you have nested construction, multiple repeated sub-elements, or when you want to enforce a structured construction API. For flat objects with optional fields, just use data classes with defaults.

## Structural Patterns

### Adapter — Converting Between Data Layers

The **Adapter pattern** is one you're probably already using without naming it. Every time you convert a network DTO to a domain model to a UI model, that's an adapter. It's like having a translator at a business meeting — the Japanese executive speaks, the translator converts it to English for the American team. The message is the same, but the format changes to fit the audience.

The real question is where to put the conversion logic and how to keep it clean. I prefer extension functions as adapters. They keep the mapping logic close to the data classes without polluting the models themselves with conversion knowledge.

```kotlin
// Network layer
data class UserResponse(
    val id: String,
    val first_name: String,
    val last_name: String,
    val avatar_url: String?,
    val created_at: String
)

// Domain layer
data class User(
    val id: String,
    val displayName: String,
    val avatarUrl: String?,
    val memberSince: LocalDate
)

// UI layer
data class UserUiModel(
    val id: String,
    val displayName: String,
    val avatarInitials: String,
    val avatarUrl: String?,
    val memberSinceFormatted: String
)

// Adapter: DTO → Domain
fun UserResponse.toDomain(): User = User(
    id = id,
    displayName = "$first_name $last_name".trim(),
    avatarUrl = avatar_url,
    memberSince = LocalDate.parse(created_at, DateTimeFormatter.ISO_DATE)
)

// Adapter: Domain → UI
fun User.toUiModel(): UserUiModel = UserUiModel(
    id = id,
    displayName = displayName,
    avatarInitials = displayName.split(" ")
        .mapNotNull { it.firstOrNull()?.uppercase() }
        .joinToString(""),
    avatarUrl = avatarUrl,
    memberSinceFormatted = "Member since ${memberSince.format(
        DateTimeFormatter.ofPattern("MMM yyyy")
    )}"
)
```

This three-layer model (DTO → Domain → UI) might seem like overkill for small features. "Why do I need three data classes for a user?" I get it. But it pays off fast. When the backend changes a field name from `first_name` to `firstName`, you only touch one mapper. When the UI needs to display dates differently on two screens, you add another UI model without touching the domain. Each layer changes for its own reasons, and changes in one layer don't ripple through the others.

### Decorator — Adding Behavior Without Modifying Code

The **Decorator pattern** wraps an existing object to add behavior without modifying the original. Imagine you ordered a plain coffee, and someone handed you a machine that automatically adds cream and sugar to any coffee that passes through it. The original coffee is untouched — you just wrapped it with extra behavior.

In Kotlin, the `by` keyword makes this ridiculously clean through **interface delegation** — you get the decorator pattern with almost zero boilerplate.

```kotlin
interface ImageLoader {
    fun load(url: String, target: ImageView)
    fun preload(url: String)
    fun clearCache()
}

class CoilImageLoader(private val context: Context) : ImageLoader {
    override fun load(url: String, target: ImageView) {
        target.load(url)
    }
    override fun preload(url: String) {
        context.imageLoader.enqueue(ImageRequest.Builder(context).data(url).build())
    }
    override fun clearCache() {
        context.imageLoader.memoryCache?.clear()
    }
}

// Decorator that adds logging — delegates everything else
class LoggingImageLoader(
    private val delegate: ImageLoader
) : ImageLoader by delegate {
    override fun load(url: String, target: ImageView) {
        Log.d("ImageLoader", "Loading: $url")
        val startTime = SystemClock.elapsedRealtime()
        delegate.load(url, target)
        Log.d("ImageLoader", "Loaded in ${SystemClock.elapsedRealtime() - startTime}ms")
    }
}
```

The `by delegate` syntax means `LoggingImageLoader` automatically forwards `preload()` and `clearCache()` to the wrapped loader. You only override what you want to decorate. Without `by`, you'd have to manually write forwarding methods for every function in the interface — even the ones you don't care about. With `by`, Kotlin writes those for you.

This is the same concept behind **OkHttp Interceptors** — each interceptor decorates the HTTP call chain, adding headers, logging, retries, or caching without modifying the core networking logic.

## Behavioural Patterns

### Observer — Flow and LiveData

If you're writing Android code with ViewModels, you're already using the **Observer pattern** constantly. `StateFlow`, `SharedFlow`, and `LiveData` are all implementations of it. The manual observer pattern with `addObserver()`/`removeObserver()` is essentially dead in modern Android — the framework handles subscription and lifecycle for you.

Think of it like a magazine subscription. You don't call the publisher every morning asking "Got anything new?" Instead, you subscribe once, and they deliver new issues to your door when they're ready. That's exactly what Flow does — your UI subscribes to a ViewModel's state, and updates arrive automatically.

```kotlin
class ProductListViewModel(
    private val productRepository: ProductRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<ProductListState>(ProductListState.Loading)
    val uiState: StateFlow<ProductListState> = _uiState.asStateFlow()

    // SharedFlow for one-time events that shouldn't replay on config change
    private val _events = MutableSharedFlow<ProductListEvent>()
    val events: SharedFlow<ProductListEvent> = _events.asSharedFlow()

    init {
        loadProducts()
    }

    private fun loadProducts() {
        viewModelScope.launch {
            _uiState.value = ProductListState.Loading
            productRepository.getProducts()
                .catch { e -> _uiState.value = ProductListState.Error(e.message ?: "Unknown error") }
                .collect { products ->
                    _uiState.value = ProductListState.Success(products)
                }
        }
    }

    fun onProductClicked(productId: String) {
        viewModelScope.launch {
            _events.emit(ProductListEvent.NavigateToDetail(productId))
        }
    }
}

sealed interface ProductListState {
    data object Loading : ProductListState
    data class Success(val products: List<Product>) : ProductListState
    data class Error(val message: String) : ProductListState
}

sealed interface ProductListEvent {
    data class NavigateToDetail(val productId: String) : ProductListEvent
    data class ShowSnackbar(val message: String) : ProductListEvent
}
```

Now here's where it gets interesting — and where a lot of people get tripped up. Notice the ViewModel has both a `StateFlow` and a `SharedFlow`. Why two different types?

**StateFlow** is for state — it always has a current value and replays the last value to new collectors. Like a whiteboard in a meeting room: anyone who walks in sees what's currently written on it. **SharedFlow** is for events — no replay by default, doesn't hold a current value. Like someone clapping once in a meeting: if you weren't there, you missed it.

> **🧠 Think about it:** What happens if you use `StateFlow` for a navigation event? The user clicks a product, you emit `NavigateToDetail("abc")`, the app navigates. Then the user rotates their phone. The Fragment re-collects the StateFlow, gets the last emitted value... and navigates again. And again. Every configuration change re-triggers the navigation. That's why one-time events belong in `SharedFlow`.

### Strategy — Swappable Behavior via Interfaces

The **Strategy pattern** is about defining a family of algorithms and making them interchangeable. It's like a GPS app — you want to get from A to B, and the app lets you pick your strategy: fastest route, shortest distance, avoid tolls. The destination is the same, but the approach changes depending on what you care about.

In Android, this shows up everywhere — different authentication methods, analytics providers, image loading strategies. Combined with DI, it becomes very powerful.

```kotlin
interface AuthStrategy {
    suspend fun authenticate(credentials: Credentials): AuthResult
    suspend fun refreshToken(token: String): AuthResult
    fun logout()
}

class GoogleAuthStrategy(
    private val googleSignInClient: GoogleSignInClient
) : AuthStrategy {
    override suspend fun authenticate(credentials: Credentials): AuthResult {
        // Google Sign-In flow
        return AuthResult.Success(token = "google_token", provider = "google")
    }
    override suspend fun refreshToken(token: String): AuthResult { /* ... */ }
    override fun logout() { googleSignInClient.signOut() }
}

class EmailAuthStrategy(
    private val authApi: AuthApi
) : AuthStrategy {
    override suspend fun authenticate(credentials: Credentials): AuthResult {
        val response = authApi.login(credentials.email, credentials.password)
        return if (response.isSuccessful) {
            AuthResult.Success(token = response.body()!!.token, provider = "email")
        } else {
            AuthResult.Failure(response.message())
        }
    }
    override suspend fun refreshToken(token: String): AuthResult { /* ... */ }
    override fun logout() { /* clear stored credentials */ }
}

// ViewModel doesn't care which strategy — inject via DI
class LoginViewModel(private val authStrategy: AuthStrategy) : ViewModel() {
    fun login(credentials: Credentials) {
        viewModelScope.launch {
            when (val result = authStrategy.authenticate(credentials)) {
                is AuthResult.Success -> { /* navigate to home */ }
                is AuthResult.Failure -> { /* show error */ }
            }
        }
    }
}
```

Look at that `LoginViewModel`. It has no idea whether the user is logging in with Google, email, or smoke signals. It just calls `authStrategy.authenticate()` and handles the result. That's the whole point — the ViewModel is strategy-agnostic.

The real value here is testability. In unit tests, you pass in a `FakeAuthStrategy` that returns whatever result you need — no mocking frameworks, no network calls, no flakiness. This is the same approach you'd use for swapping analytics providers (Firebase vs Mixpanel), or feature flag systems (LaunchDarkly vs local config).

### State — Sealed Class State Machines

The **State pattern** goes beyond just having a sealed class to represent UI states. A proper state machine enforces **valid transitions** — you can't go from `LoggedOut` directly to `ProfileLoaded` without passing through `Authenticating` first.

Imagine a traffic light. It goes green → yellow → red → green. It never goes green → red. That would cause accidents. A state machine is the same idea applied to your code: it defines which transitions are legal and silently ignores the illegal ones.

```kotlin
sealed interface AuthState {
    data object LoggedOut : AuthState
    data object Authenticating : AuthState
    data class Authenticated(val user: User) : AuthState
    data class AuthError(val message: String, val retryCount: Int = 0) : AuthState

    // Enforce valid transitions
    fun transition(event: AuthEvent): AuthState = when (this) {
        is LoggedOut -> when (event) {
            is AuthEvent.LoginRequested -> Authenticating
            else -> this // ignore invalid transitions
        }
        is Authenticating -> when (event) {
            is AuthEvent.LoginSuccess -> Authenticated(event.user)
            is AuthEvent.LoginFailed -> AuthError(event.message)
            else -> this
        }
        is Authenticated -> when (event) {
            is AuthEvent.LogoutRequested -> LoggedOut
            else -> this
        }
        is AuthError -> when (event) {
            is AuthEvent.LoginRequested -> if (retryCount < 3) Authenticating else this
            is AuthEvent.LogoutRequested -> LoggedOut
            else -> this
        }
    }
}

sealed interface AuthEvent {
    data object LoginRequested : AuthEvent
    data class LoginSuccess(val user: User) : AuthEvent
    data class LoginFailed(val message: String) : AuthEvent
    data object LogoutRequested : AuthEvent
}

class AuthViewModel(private val authStrategy: AuthStrategy) : ViewModel() {
    private val _state = MutableStateFlow<AuthState>(AuthState.LoggedOut)
    val state: StateFlow<AuthState> = _state.asStateFlow()

    fun onEvent(event: AuthEvent) {
        val newState = _state.value.transition(event)
        _state.value = newState

        // Side effects based on state transitions
        when (newState) {
            is AuthState.Authenticating -> performLogin()
            else -> { /* no side effect */ }
        }
    }

    private fun performLogin() {
        viewModelScope.launch {
            when (val result = authStrategy.authenticate(credentials)) {
                is AuthResult.Success -> onEvent(AuthEvent.LoginSuccess(result.user))
                is AuthResult.Failure -> onEvent(AuthEvent.LoginFailed(result.message))
            }
        }
    }
}
```

> **💡 The "aha" moment:** The `transition()` function on the sealed interface is what makes this work. By making state transitions explicit and exhaustive, the compiler catches impossible state transitions at compile time. You can't accidentally set the state to `Authenticated` from `LoggedOut` — the transition function simply ignores that event. Compare this to the alternative: a ViewModel with 15 boolean flags like `isLoading`, `isLoggedIn`, `hasError`, `isRetrying` — where any combination is technically possible, including nonsensical ones like `isLoading = true` AND `isLoggedIn = true` AND `hasError = true` all at once. The sealed state machine makes impossible states impossible.

### Template Method — Base Classes and Why to Be Careful

The **Template Method** pattern defines an algorithm skeleton in a base class, letting subclasses override specific steps. Think of it like a form letter: the structure is fixed ("Dear [NAME], Thank you for [REASON]..."), but specific parts get filled in differently each time.

In Android, you've seen this with `BaseActivity` and `BaseFragment` patterns — an abstract class that handles common setup and provides hooks for subclasses.

```kotlin
abstract class BaseFragment<VB : ViewBinding> : Fragment() {
    private var _binding: VB? = null
    protected val binding get() = _binding!!

    abstract fun inflateBinding(inflater: LayoutInflater, container: ViewGroup?): VB
    abstract fun setupViews()
    open fun setupObservers() {} // optional hook

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = inflateBinding(inflater, container)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupViews()
        setupObservers()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

// Subclass only fills in the specific parts
class ProfileFragment : BaseFragment<FragmentProfileBinding>() {
    override fun inflateBinding(inflater: LayoutInflater, container: ViewGroup?) =
        FragmentProfileBinding.inflate(inflater, container, false)

    override fun setupViews() {
        binding.editButton.setOnClickListener { /* handle click */ }
    }

    override fun setupObservers() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collect { state -> updateUi(state) }
        }
    }
}
```

I need to be honest here — I've grown skeptical of deep `BaseActivity`/`BaseFragment` hierarchies. They violate composition over inheritance, they become dumping grounds for "shared" logic that only 3 out of 20 fragments actually need, and they make debugging harder because behavior is split across multiple classes. A BaseFragment that handles just ViewBinding cleanup (like above) is fine. A BaseFragment with 200 lines of analytics tracking, permission handling, error dialogs, and network state management is a problem.

> **⚡ Quick check:** Look at your project's `BaseFragment` right now. How many of its features does every single fragment actually use? If the answer is less than half, that base class is doing too much.

The modern alternative is **composition** — use extension functions, utility classes, and Compose's composable functions to share behavior without inheritance.

```kotlin
// Instead of BaseFragment doing error handling, use a composable utility
@Composable
fun <T> HandleState(
    state: StateFlow<UiState<T>>,
    onLoading: @Composable () -> Unit = { CircularProgressIndicator() },
    onError: @Composable (String) -> Unit = { ErrorMessage(it) },
    onSuccess: @Composable (T) -> Unit
) {
    when (val current = state.collectAsStateWithLifecycle().value) {
        is UiState.Loading -> onLoading()
        is UiState.Error -> onError(current.message)
        is UiState.Success -> onSuccess(current.data)
    }
}
```

This achieves the same reuse as template method but without forcing an inheritance hierarchy. Each screen opts into the shared behavior it needs rather than inheriting everything from a base class. It's the difference between a buffet (pick what you want) and a prix fixe menu (eat everything whether you want it or not).

## Picking the Right Pattern

The patterns I use most frequently in Android codebases are **Factory** (sealed class factories for creating the right implementation), **Strategy** (swappable behavior behind interfaces, especially with DI), **State** (sealed class state machines in ViewModels), and **Observer** (StateFlow/SharedFlow — you're already using this). The ones I actively avoid writing manually are **Singleton** (let Hilt handle it) and deep **Template Method** hierarchies (prefer composition).

But here's what matters more than any individual pattern: the real skill isn't memorizing pattern definitions — it's recognizing when your code has a structural problem that a pattern solves. If you're writing the same `when` branch in five places, you probably need Strategy. If your ViewModel has 15 boolean flags, you need a State machine. If your tests are impossible to write because everything is tightly coupled, you need Factory and dependency injection.

Patterns aren't decoration. They're tools for solving real problems. And like any tool, the best one is the one you reach for at the right moment — not the one you force into every situation because you just learned about it.

Thanks for reading!



